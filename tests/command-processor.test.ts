import test from "node:test";
import assert from "node:assert/strict";

import { WorkspaceProcessor, createCommand } from "../packages/command-processor/src/index.js";
import type { JsonObject } from "../packages/protocol/src/index.js";

const fullCapability = { actor_id: "actor-1", can_read_content: true, can_write: true, can_accept: true };
const readonlyCapability = { actor_id: "reader", can_read_content: true, can_write: false, can_accept: false };

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
