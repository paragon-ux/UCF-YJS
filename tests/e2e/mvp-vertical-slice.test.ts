import { mkdtemp, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import test from "node:test";
import assert from "node:assert/strict";

import { WorkspaceProcessor, createCommand } from "../../packages/command-processor/src/index.js";
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
  const replicaA = memory.connect("replica-a");
  const replicaB = memory.connect("replica-b");
  replicaA.getText("doc-1").insert(0, "Alpha beta");
  replicaB.getText("doc-1").insert(0, "Intro ");
  memory.flush({ duplicate: true, reorder: true });
  assert.equal(replicaA.getText("doc-1").toString(), replicaB.getText("doc-1").toString());

  const dir = await mkdtemp(join(tmpdir(), "ucf-yjs-e2e-"));
  try {
    const localPath = join(dir, "state.bin");
    const local = await LocalProvider.open(localPath);
    local.importState(memory.exportState());
    await local.save();
    const reloadedLocal = await LocalProvider.open(localPath);
    const reloadedDoc = reloadedLocal.connect("after-restart");
    assert.equal(reloadedDoc.getText("doc-1").toString(), replicaA.getText("doc-1").toString());

    const processor = new WorkspaceProcessor("ws-1");
    processor.submit(command("cmd-doc", "document.create", { kind: "document", document_id: "doc-1" }, { document_id: "doc-1", text: "Alpha beta" }), fullCapability);
    processor.submit(
      command("cmd-cite", "citation.activate", { kind: "document", document_id: "doc-1" }, { citation_id: "c1", start: 0, end: 5, expected_text: "Alpha" }),
      fullCapability
    );
    processor.submit(
      command("cmd-before", "document.replace_range", { kind: "document", document_id: "doc-1" }, { start: 0, end: 0, text: "Intro " }),
      fullCapability
    );
    const resolved = processor.submit(command("cmd-resolve", "citation.resolve", { kind: "citation", citation_id: "c1" }, { citation_id: "c1" }), fullCapability);
    assert.equal(resolved.projections.citations[0]?.range?.start, 6);
    assert.equal(resolved.projections.citations[0]?.status, "valid");
    processor.submit(
      command("cmd-inside", "document.replace_range", { kind: "document", document_id: "doc-1" }, { start: 8, end: 9, text: "x" }),
      fullCapability
    );
    const changed = processor.submit(command("cmd-resolve-changed", "citation.resolve", { kind: "citation", citation_id: "c1" }, { citation_id: "c1" }), fullCapability);
    assert.equal(changed.projections.citations[0]?.status, "changed_unaccepted");
    const accepted = processor.submit(command("cmd-accept", "citation.accept_current", { kind: "citation", citation_id: "c1" }, { citation_id: "c1" }), fullCapability);
    assert.equal(accepted.projections.citations[0]?.status, "valid");
    const checkpoint = processor.submit(command("cmd-checkpoint", "checkpoint.create", { kind: "workspace" }, {}), fullCapability);
    const checkpointId = String(checkpoint.outcome.affected_resources[0]?.checkpoint_id);
    const reproduced = processor.checkpoints.openReadonly(checkpointId);
    assert.equal(reproduced.manifest.checkpoint_id, checkpointId);

    const readableView = processor.projections(fullCapability);
    const redactedView = processor.projections(redactedCapability);
    assert.equal(readableView.accepted_projection_digest, redactedView.accepted_projection_digest);
    assert.equal(readableView.agent_view.documents[0]?.text?.includes("Intro"), true);
    assert.equal(redactedView.agent_view.documents[0]?.text, null);
    assert.notEqual(readableView.agent_view_response_digest, redactedView.agent_view_response_digest);

    const conflict = processor.submit(
      command("cmd-conflict", "citation.activate", { kind: "document", document_id: "doc-1" }, { start: 0, end: 5, expected_text: "wrong" }),
      fullCapability
    );
    assert.equal(conflict.outcome.code, "UCFY_CONFLICT_CHANGED_EVIDENCE");
    assert.equal(JSON.stringify(conflict.outcome.diagnostics).includes("Intro"), false);
    assert.equal(JSON.stringify(conflict.outcome).includes("raw_yjs_update"), false);

    const cliProcessor = new WorkspaceProcessor("ws-1");
    const cliInput = [
      command("cli-doc", "document.create", { kind: "document", document_id: "doc-1" }, { document_id: "doc-1", text: "Alpha beta" }),
      command("cli-cite", "citation.activate", { kind: "document", document_id: "doc-1" }, { citation_id: "c1", start: 0, end: 5, expected_text: "Alpha" }),
      command("cli-status", "status.get", { kind: "workspace" }, {})
    ]
      .map((item) => JSON.stringify(item))
      .join("\n");
    const cliLines = runJsonl(cliInput, cliProcessor, fullCapability)
      .trim()
      .split("\n")
      .map((line) => JSON.parse(line));
    assert.equal(cliLines[0].outcome.code, "UCFY_OK");
    assert.equal(cliLines[1].outcome.code, "UCFY_OK");
    assert.equal(cliLines[2].projections.workspace_status.semantic_frontier.workspace_sequence, 3);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});
