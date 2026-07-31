import { mkdtemp, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import test from "node:test";
import assert from "node:assert/strict";

import { WorkspaceProcessor, createCommand, type WorkspaceProcessorSnapshot } from "../../packages/command-processor/src/index.js";
import { runJsonl } from "../../packages/cli/src/index.js";
import { LocalProvider } from "../../packages/provider-local/src/index.js";
import { MemoryProvider } from "../../packages/provider-memory/src/index.js";
import type { JsonObject } from "../../packages/protocol/src/index.js";

const fullCapability = { actor_id: "actor-1", can_read_content: true, can_write: true, can_accept: true };
const redactedCapability = { actor_id: "actor-2", can_read_content: false, can_write: false, can_accept: false };

function command(command_id: string, operation: string, target: JsonObject & { kind: string }, payload: JsonObject, idempotencyKey = `idem-${command_id}`) {
  return createCommand({
    command_id,
    idempotency_key: idempotencyKey,
    actor: { actor_id: "actor-1", kind: "agent" },
    workspace_id: "ws-1",
    operation,
    target,
    payload
  });
}

test("complete MVP vertical slice across providers, processor, CLI, restart, checkpoints, and agent views", async () => {
  const memory = new MemoryProvider();
  const processorDoc = memory.connect("processor");
  const replicaA = memory.connect("replica-a");
  const replicaB = memory.connect("replica-b");
  const processor = new WorkspaceProcessor("ws-1", "ucf-yjs.reducer.v1", { ydoc: processorDoc });

  processor.submit(command("cmd-workspace", "workspace.create", { kind: "workspace" }, { workspace_id: "ws-1" }), fullCapability);
  processor.submit(command("cmd-doc", "document.create", { kind: "document", document_id: "doc-1" }, { document_id: "doc-1", text: "Alpha beta" }), fullCapability);
  memory.sync();
  assert.equal(replicaA.getText("doc-1").toString(), "Alpha beta");
  assert.equal(replicaB.getText("doc-1").toString(), "Alpha beta");

  processor.submit(
    command("cmd-cite", "citation.activate", { kind: "document", document_id: "doc-1" }, { citation_id: "c1", start: 0, end: 5, expected_text: "Alpha" }),
    fullCapability
  );

  memory.disconnect("replica-b");
  processor.submit(
    command("cmd-before", "document.replace_range", { kind: "document", document_id: "doc-1" }, { start: 0, end: 0, text: "Intro " }),
    fullCapability
  );
  replicaB.getText("doc-1").delete(3, 2);
  replicaB.getText("doc-1").insert(3, "xy");
  memory.flush({ duplicate: true, reorder: true });
  memory.reconnect("replica-b");
  memory.flush({ duplicate: true, reorder: true });
  memory.sync();
  assert.equal(replicaA.getText("doc-1").toString(), replicaB.getText("doc-1").toString());
  assert.equal(processorDoc.getText("doc-1").toString(), replicaA.getText("doc-1").toString());

  const dir = await mkdtemp(join(tmpdir(), "ucf-yjs-e2e-"));
  try {
    const resolved = processor.submit(command("cmd-resolve", "citation.resolve", { kind: "citation", citation_id: "c1" }, { citation_id: "c1" }), fullCapability);
    assert.equal(resolved.projections.citations[0]?.status, "changed_unaccepted");
    const accepted = processor.submit(command("cmd-accept", "citation.accept_current", { kind: "citation", citation_id: "c1" }, { citation_id: "c1" }), fullCapability);
    assert.equal(accepted.projections.citations[0]?.status, "valid");
    const acceptedRange = processor.state().citations[0];
    assert.notEqual(acceptedRange, undefined);
    replicaA.getText("doc-1").delete(acceptedRange!.start, 1);
    replicaA.getText("doc-1").insert(acceptedRange!.start, "Z");
    memory.sync();
    const blockedCheckpoint = processor.submit(command("cmd-checkpoint-blocked", "checkpoint.create", { kind: "workspace" }, {}), fullCapability);
    assert.equal(blockedCheckpoint.outcome.outcome, "conflict");
    assert.equal(blockedCheckpoint.outcome.code, "UCFY_CONFLICT_CHANGED_EVIDENCE");
    assert.equal(processor.checkpoints.snapshot().length, 0);
    const acceptedAfterRawEdit = processor.submit(command("cmd-accept-raw-edit", "citation.accept_current", { kind: "citation", citation_id: "c1" }, { citation_id: "c1" }), fullCapability);
    assert.equal(acceptedAfterRawEdit.projections.citations[0]?.status, "valid");
    const checkpoint = processor.submit(command("cmd-checkpoint", "checkpoint.create", { kind: "workspace" }, {}), fullCapability);
    const checkpointId = String(checkpoint.outcome.affected_resources[0]?.checkpoint_id);
    const reproduced = processor.checkpoints.openReadonly(checkpointId);
    assert.equal(reproduced.manifest.checkpoint_id, checkpointId);

    const localPath = join(dir, "workspace.ucfyjs");
    const local = await LocalProvider.open(localPath);
    local.importState(memory.exportState());
    await local.saveWorkspace(processor.snapshot());
    const reloadedLocal = await LocalProvider.open(localPath);
    const reloadedDoc = reloadedLocal.connect("after-restart");
    assert.equal(reloadedDoc.getText("doc-1").toString(), replicaA.getText("doc-1").toString());
    const snapshot = reloadedLocal.authoritySnapshot<WorkspaceProcessorSnapshot>();
    assert.notEqual(snapshot, null);
    const restoredProcessor = WorkspaceProcessor.fromSnapshot(snapshot!, reloadedDoc);
    assert.equal(restoredProcessor.semanticLog.frontier().outcome_hash, processor.semanticLog.frontier().outcome_hash);
    assert.equal(restoredProcessor.checkpoints.openReadonly(checkpointId).manifest.checkpoint_id, checkpointId);

    const readableView = restoredProcessor.projections(fullCapability);
    const redactedView = restoredProcessor.projections(redactedCapability);
    assert.equal(readableView.accepted_projection_digest, redactedView.accepted_projection_digest);
    assert.equal(readableView.agent_view.documents[0]?.text?.includes("Intro"), true);
    assert.equal(redactedView.agent_view.documents[0]?.text, null);
    assert.notEqual(readableView.agent_view_response_digest, redactedView.agent_view_response_digest);

    const conflict = restoredProcessor.submit(
      command("cmd-conflict", "citation.activate", { kind: "document", document_id: "doc-1" }, { start: 0, end: 5, expected_text: "wrong" }),
      fullCapability
    );
    assert.equal(conflict.outcome.code, "UCFY_CONFLICT_CHANGED_EVIDENCE");
    assert.equal(JSON.stringify(conflict.outcome.diagnostics).includes("Intro"), false);
    assert.equal(JSON.stringify(conflict.outcome).includes("raw_yjs_update"), false);

    const cliInput = [
      command("cli-status", "status.get", { kind: "workspace" }, {})
    ]
      .map((item) => JSON.stringify(item))
      .join("\n");
    const cliLines = runJsonl(cliInput, restoredProcessor, fullCapability)
      .trim()
      .split("\n")
      .map((line) => JSON.parse(line));
    assert.equal(cliLines[0].outcome.code, "UCFY_OK");
    assert.equal(cliLines[0].projections.workspace_status.semantic_frontier.workspace_sequence, restoredProcessor.semanticLog.frontier().workspace_sequence);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});
