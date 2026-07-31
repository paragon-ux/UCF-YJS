import test from "node:test";
import assert from "node:assert/strict";

import { WorkspaceProcessor, createCommand, type ObservationLogRecord } from "../packages/command-processor/src/index.js";
import { canonicalJson, type JsonObject } from "../packages/protocol/src/index.js";

const fullCapability = { actor_id: "actor-1", can_read_content: true, can_write: true, can_accept: true };
const readonlyCapability = { actor_id: "reader", can_read_content: true, can_write: false, can_accept: false };
const writeOnlyCapability = { actor_id: "writer", can_read_content: true, can_write: true, can_accept: false };

function command(
  command_id: string,
  operation: string,
  target: JsonObject & { kind: string } = { kind: "workspace" },
  payload: JsonObject = {}
) {
  return createCommand({
    command_id,
    idempotency_key: `idem-${command_id}`,
    actor: { actor_id: "actor-1", kind: "agent" },
    workspace_id: "ws-1",
    operation,
    target,
    payload
  });
}

test("processor commits document and citation lifecycle with explicit acceptance", () => {
  const processor = new WorkspaceProcessor("ws-1");
  processor.submit(command("cmd-doc", "document.create", { kind: "document", document_id: "doc-1" }, { document_id: "doc-1", text: "Alpha beta" }), fullCapability);
  const activated = processor.submit(
    command("cmd-cite", "citation.activate", { kind: "document", document_id: "doc-1" }, { citation_id: "c1", start: 0, end: 5, expected_text: "Alpha" }),
    fullCapability
  );
  assert.equal(activated.outcome.outcome, "committed");
  assert.equal(activated.projections.citations[0]?.status, "valid");

  processor.submit(
    command("cmd-edit-before", "document.replace_range", { kind: "document", document_id: "doc-1" }, { start: 0, end: 0, text: "Intro " }),
    fullCapability
  );
  const afterBeforeEdit = processor.submit(command("cmd-resolve-1", "citation.resolve", { kind: "citation", citation_id: "c1" }, { citation_id: "c1" }), fullCapability);
  assert.equal(afterBeforeEdit.projections.citations[0]?.status, "valid");

  processor.submit(
    command("cmd-edit-inside", "document.replace_range", { kind: "document", document_id: "doc-1" }, { start: 7, end: 8, text: "x" }),
    fullCapability
  );
  const changed = processor.submit(command("cmd-resolve-2", "citation.resolve", { kind: "citation", citation_id: "c1" }, { citation_id: "c1" }), fullCapability);
  assert.equal(changed.projections.citations[0]?.status, "changed_unaccepted");

  const accepted = processor.submit(command("cmd-accept", "citation.accept_current", { kind: "citation", citation_id: "c1" }, { citation_id: "c1" }), fullCapability);
  assert.equal(accepted.projections.citations[0]?.status, "valid");
  const deactivated = processor.submit(command("cmd-deactivate", "citation.deactivate", { kind: "citation", citation_id: "c1" }, { citation_id: "c1" }), fullCapability);
  assert.equal(deactivated.projections.citations[0]?.status, "inactive");
});

test("processor distinguishes required typed conflicts and rejections", () => {
  const processor = new WorkspaceProcessor("ws-1");
  const denied = processor.submit(command("cmd-denied", "document.create", { kind: "document", document_id: "doc-1" }, { document_id: "doc-1" }), readonlyCapability);
  assert.equal(denied.outcome.outcome, "rejected");
  assert.equal(denied.outcome.code, "UCFY_REJECTED_PERMISSION");

  const missing = processor.submit(command("cmd-missing", "citation.activate", { kind: "document", document_id: "missing" }, { start: 0, end: 1 }), fullCapability);
  assert.equal(missing.outcome.code, "UCFY_CONFLICT_MISSING_TARGET");

  const ambiguous = processor.submit(command("cmd-ambiguous", "citation.activate", { kind: "document", document_id: "missing" }, { ambiguous: true }), fullCapability);
  assert.equal(ambiguous.outcome.code, "UCFY_CONFLICT_AMBIGUOUS_REFERENCE");

  processor.submit(command("cmd-doc", "document.create", { kind: "document", document_id: "doc-1" }, { document_id: "doc-1", text: "Alpha" }), fullCapability);
  const changed = processor.submit(
    command("cmd-changed", "citation.activate", { kind: "document", document_id: "doc-1" }, { start: 0, end: 5, expected_text: "Beta" }),
    fullCapability
  );
  assert.equal(changed.outcome.code, "UCFY_CONFLICT_CHANGED_EVIDENCE");

  const invalidRange = processor.submit(
    command("cmd-invalid-range", "citation.activate", { kind: "document", document_id: "doc-1" }, { start: 4, end: 1 }),
    fullCapability
  );
  assert.equal(invalidRange.outcome.code, "UCFY_CONFLICT_INVALID_TRANSITION");

  const invalid = processor.submit(command("cmd-invalid", "not.supported"), fullCapability);
  assert.equal(invalid.outcome.code, "UCFY_CONFLICT_INVALID_TRANSITION");

  const stale = processor.submit(
    {
      ...command("cmd-stale", "status.get"),
      observed: { live_version: "sha256:" + "0".repeat(64) }
    },
    fullCapability
  );
  assert.equal(stale.outcome.code, "UCFY_CONFLICT_STALE_OBSERVATION");
});

test("processor requires accept capability for current evidence acceptance", () => {
  const processor = new WorkspaceProcessor("ws-1");
  processor.submit(command("cmd-doc", "document.create", { kind: "document", document_id: "doc-1" }, { document_id: "doc-1", text: "Alpha beta" }), fullCapability);
  processor.submit(
    command("cmd-cite", "citation.activate", { kind: "document", document_id: "doc-1" }, { citation_id: "c1", start: 0, end: 5, expected_text: "Alpha" }),
    fullCapability
  );

  const denied = processor.submit(command("cmd-accept-denied", "citation.accept_current", { kind: "citation", citation_id: "c1" }, { citation_id: "c1" }), writeOnlyCapability);
  assert.equal(denied.outcome.code, "UCFY_REJECTED_PERMISSION");
});

test("processor rejects accepting a missing citation without changing accepted evidence", () => {
  const processor = new WorkspaceProcessor("ws-1");
  processor.submit(command("cmd-doc", "document.create", { kind: "document", document_id: "doc-1" }, { document_id: "doc-1", text: "Alpha beta" }), fullCapability);
  processor.submit(
    command("cmd-cite", "citation.activate", { kind: "document", document_id: "doc-1" }, { citation_id: "c1", start: 0, end: 5, expected_text: "Alpha" }),
    fullCapability
  );
  const acceptedBefore = processor.state().citations[0]?.accepted_evidence_hash;
  processor.submit(command("cmd-delete", "document.replace_range", { kind: "document", document_id: "doc-1" }, { start: 0, end: 5, text: "" }), fullCapability);

  const denied = processor.submit(command("cmd-accept-missing", "citation.accept_current", { kind: "citation", citation_id: "c1" }, { citation_id: "c1" }), fullCapability);
  const citation = processor.state().citations[0];
  assert.equal(denied.outcome.outcome, "conflict");
  assert.equal(denied.outcome.code, "UCFY_CONFLICT_MISSING_TARGET");
  assert.equal(citation?.accepted_evidence_hash, acceptedBefore);
  assert.notEqual(citation?.status, "valid");
});

test("processor handles duplicate idempotency key with same and different payloads", () => {
  const processor = new WorkspaceProcessor("ws-1");
  const firstCommand = command("cmd-doc", "document.create", { kind: "document", document_id: "doc-1" }, { document_id: "doc-1", text: "Alpha" });
  const first = processor.submit(firstCommand, fullCapability);
  const retrySame = processor.submit({ ...firstCommand, command_id: "cmd-doc-retry" }, fullCapability);
  const retryDifferent = processor.submit(
    { ...firstCommand, command_id: "cmd-doc-different", payload: { document_id: "doc-1", text: "Changed" } },
    fullCapability
  );

  assert.equal(retrySame.outcome.outcome_hash, first.outcome.outcome_hash);
  assert.equal(retryDifferent.outcome.code, "UCFY_CONFLICT_IDEMPOTENCY_PAYLOAD");
});

test("processor returns live versions that clients can observe after committed, rejected, and conflict outcomes", () => {
  const processor = new WorkspaceProcessor("ws-1");
  const created = processor.submit(
    command("cmd-doc", "document.create", { kind: "document", document_id: "doc-1" }, { document_id: "doc-1", text: "Alpha" }),
    fullCapability
  );
  assert.equal(created.outcome.new_live_version, processor.projections(fullCapability).workspace_status.live_version);

  const observed = {
    ...command("cmd-status", "status.get"),
    observed: { live_version: created.outcome.new_live_version ?? "" }
  };
  const status = processor.submit(observed, fullCapability);
  assert.equal(status.outcome.code, "UCFY_OK");

  const rejected = processor.submit(command("cmd-denied-after-live", "document.create", { kind: "document", document_id: "doc-2" }, { document_id: "doc-2" }), readonlyCapability);
  assert.equal(rejected.outcome.new_live_version, processor.projections(fullCapability).workspace_status.live_version);
  const afterRejected = processor.submit(
    { ...command("cmd-status-after-rejected", "status.get"), observed: { live_version: rejected.outcome.new_live_version ?? "" } },
    fullCapability
  );
  assert.equal(afterRejected.outcome.code, "UCFY_OK");

  const conflict = processor.submit(
    { ...command("cmd-idem-conflict", "document.create", { kind: "document", document_id: "doc-3" }, { document_id: "doc-3" }), idempotency_key: "idem-cmd-doc" },
    fullCapability
  );
  assert.equal(conflict.outcome.code, "UCFY_CONFLICT_IDEMPOTENCY_PAYLOAD");
  assert.equal(conflict.outcome.new_live_version, processor.projections(fullCapability).workspace_status.live_version);
  const afterConflict = processor.submit(
    { ...command("cmd-status-after-conflict", "status.get"), observed: { live_version: conflict.outcome.new_live_version ?? "" } },
    fullCapability
  );
  assert.equal(afterConflict.outcome.code, "UCFY_OK");
});

test("observational reads do not advance semantic authority", () => {
  const processor = new WorkspaceProcessor("ws-1");
  processor.submit(command("cmd-doc", "document.create", { kind: "document", document_id: "doc-1" }, { document_id: "doc-1", text: "Alpha beta" }), fullCapability);
  const beforeLogBytes = canonicalJson({ records: processor.semanticLog.snapshot() as unknown as JsonObject[] });
  const beforeFrontier = processor.semanticLog.frontier();
  const beforeLiveVersion = processor.projections(fullCapability).workspace_status.live_version;

  const status = processor.submit(command("cmd-status", "status.get"), fullCapability);
  const agentView = processor.submit(command("cmd-agent-view", "agent_view.get"), { ...fullCapability, can_read_content: false });

  assert.equal(status.outcome.code, "UCFY_OK");
  assert.equal(agentView.outcome.code, "UCFY_OK");
  assert.deepEqual(processor.semanticLog.frontier(), beforeFrontier);
  assert.equal(canonicalJson({ records: processor.semanticLog.snapshot() as unknown as JsonObject[] }), beforeLogBytes);
  assert.equal(processor.projections(fullCapability).workspace_status.live_version, beforeLiveVersion);
  assert.equal(status.projections.workspace_status.live_version, beforeLiveVersion);
  assert.equal(agentView.projections.workspace_status.semantic_frontier.workspace_sequence, beforeFrontier.workspace_sequence);

  processor.submit(
    command("cmd-edit-after-observe", "document.replace_range", { kind: "document", document_id: "doc-1" }, { start: 5, end: 5, text: "!" }),
    fullCapability
  );
  assert.equal(processor.semanticLog.frontier().workspace_sequence, beforeFrontier.workspace_sequence + 1);
});

test("observational reads do not change checkpoint identity", () => {
  const processor = new WorkspaceProcessor("ws-1");
  processor.submit(command("cmd-doc", "document.create", { kind: "document", document_id: "doc-1" }, { document_id: "doc-1", text: "Alpha beta" }), fullCapability);
  processor.submit(command("cmd-cite", "citation.activate", { kind: "document", document_id: "doc-1" }, { citation_id: "c1", start: 0, end: 5, expected_text: "Alpha" }), fullCapability);
  processor.submit(command("cmd-accept", "citation.accept_current", { kind: "citation", citation_id: "c1" }, { citation_id: "c1" }), fullCapability);
  processor.submit(command("cmd-checkpoint", "checkpoint.create"), fullCapability);
  const beforeCheckpointId = processor.checkpoints.snapshot()[0]?.checkpoint_id;

  processor.submit(command("cmd-status-checkpoint", "status.get"), fullCapability);
  processor.submit(command("cmd-agent-view-checkpoint", "agent_view.get"), readonlyCapability);

  assert.equal(processor.checkpoints.snapshot()[0]?.checkpoint_id, beforeCheckpointId);
});

test("observation audit failure does not corrupt semantic authority", () => {
  const observationRecords: ObservationLogRecord[] = [];
  const processor = new WorkspaceProcessor("ws-1", "ucf-yjs.reducer.v1", {
    observation_log: {
      append(record) {
        observationRecords.push(record);
        throw new Error("audit unavailable");
      }
    }
  });
  processor.submit(command("cmd-doc", "document.create", { kind: "document", document_id: "doc-1" }, { document_id: "doc-1", text: "Alpha" }), fullCapability);
  const beforeLogBytes = canonicalJson({ records: processor.semanticLog.snapshot() as unknown as JsonObject[] });
  const result = processor.submit(command("cmd-status-audit-fails", "status.get"), fullCapability);
  processor.submit(command("cmd-status-audit-fails-again", "status.get"), fullCapability);

  assert.equal(result.outcome.code, "UCFY_OK");
  assert.deepEqual(observationRecords.map((record) => record.observation_sequence), [1, 2]);
  assert.equal(canonicalJson({ records: processor.semanticLog.snapshot() as unknown as JsonObject[] }), beforeLogBytes);
  assert.equal(processor.semanticLog.frontier().workspace_sequence, 1);
});

test("processor gives distinct malformed requests distinct rejected outcomes", () => {
  const processor = new WorkspaceProcessor("ws-1");
  const first = processor.submit({ command_id: "bad-1" } as unknown as ReturnType<typeof command>, fullCapability);
  const second = processor.submit({ command_id: "bad-2", actor: "wrong" } as unknown as ReturnType<typeof command>, fullCapability);

  assert.equal(first.outcome.code, "UCFY_REJECTED_SCHEMA");
  assert.equal(second.outcome.code, "UCFY_REJECTED_SCHEMA");
  assert.equal(first.outcome.command_id, "bad-1");
  assert.equal(second.outcome.command_id, "bad-2");
  assert.notEqual(first.outcome.outcome_hash, second.outcome.outcome_hash);
});

test("processor does not publish reducer mutations when semantic log append fails", () => {
  const processor = new WorkspaceProcessor("ws-1");
  const semanticLog = processor.semanticLog as unknown as {
    append: typeof processor.semanticLog.append;
  };
  semanticLog.append = () => {
    throw new Error("injected append failure");
  };

  assert.throws(
    () => processor.submit(command("cmd-doc", "document.create", { kind: "document", document_id: "doc-1" }, { document_id: "doc-1", text: "Alpha" }), fullCapability),
    /injected append failure/
  );
  assert.equal(processor.projections(fullCapability).documents.length, 0);
  assert.equal(processor.semanticLog.frontier().workspace_sequence, 0);
});

test("workspace.create publishes the staged workspace id", () => {
  const processor = new WorkspaceProcessor("constructor-ws");
  const result = processor.submit(command("cmd-workspace", "workspace.create", { kind: "workspace" }, { workspace_id: "payload-ws" }), fullCapability);

  assert.equal(result.projections.workspace_status.workspace_id, "payload-ws");
  assert.equal(processor.projections(fullCapability).workspace_status.workspace_id, "payload-ws");
});

test("processor classifies deleted citation target as missing", () => {
  const processor = new WorkspaceProcessor("ws-1");
  processor.submit(command("cmd-doc", "document.create", { kind: "document", document_id: "doc-1" }, { document_id: "doc-1", text: "Alpha beta" }), fullCapability);
  processor.submit(
    command("cmd-cite", "citation.activate", { kind: "document", document_id: "doc-1" }, { citation_id: "c1", start: 0, end: 5, expected_text: "Alpha" }),
    fullCapability
  );
  processor.submit(
    command("cmd-delete", "document.replace_range", { kind: "document", document_id: "doc-1" }, { start: 0, end: 5, text: "" }),
    fullCapability
  );
  const resolved = processor.submit(command("cmd-resolve", "citation.resolve", { kind: "citation", citation_id: "c1" }, { citation_id: "c1" }), fullCapability);
  assert.equal(resolved.projections.citations[0]?.status, "missing");
});
