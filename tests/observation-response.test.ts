import test from "node:test";
import assert from "node:assert/strict";

import { WorkspaceProcessor, createCommand } from "../packages/command-processor/src/index.js";
import {
  OBSERVATION_RESPONSE_SCHEMA_VERSION,
  compatibilityFor,
  validateObservationResponseEnvelope,
  validateOutcomeEnvelope,
  type JsonObject
} from "../packages/protocol/src/index.js";

const capability = { actor_id: "observer", can_read_content: true, can_write: true, can_accept: true };

function command(command_id: string, operation: string) {
  return createCommand({
    command_id,
    idempotency_key: `idem-${command_id}`,
    actor: { actor_id: "observer", kind: "agent" },
    workspace_id: "ws-observation",
    operation,
    target: { kind: "workspace" },
    payload: {} as JsonObject
  });
}

test("observation responses are not semantic outcome records", () => {
  const processor = new WorkspaceProcessor("ws-observation");
  const before = processor.semanticLog.frontier();
  const result = processor.submit(command("status-1", "status.get"), capability);
  const response = result.outcome as unknown as Record<string, unknown>;

  assert.equal(response.schema_version, OBSERVATION_RESPONSE_SCHEMA_VERSION);
  assert.equal(response.record_kind, "observation_response");
  assert.equal(typeof response.response_digest, "string");
  assert.equal("outcome_hash" in response, false);
  assert.equal(validateObservationResponseEnvelope(response).ok, true);
  assert.equal(validateOutcomeEnvelope(response).ok, false);
  assert.equal(validateObservationResponseEnvelope({ ...response, outcome_hash: "sha256:" + "0".repeat(64) }).ok, false);
  assert.deepEqual(compatibilityFor("observation_response_schema", OBSERVATION_RESPONSE_SCHEMA_VERSION), { ok: true, mode: "read_write" });
  assert.deepEqual(processor.semanticLog.frontier(), before);
});

test("semantic outcomes remain valid outcome-chain envelopes", () => {
  const processor = new WorkspaceProcessor("ws-observation");
  const result = processor.submit(
    createCommand({
      command_id: "doc-1",
      idempotency_key: "idem-doc-1",
      actor: { actor_id: "observer", kind: "agent" },
      workspace_id: "ws-observation",
      operation: "document.create",
      target: { kind: "document", document_id: "doc-1" },
      payload: { document_id: "doc-1", text: "Alpha" }
    }),
    capability
  );

  const outcome = result.outcome as unknown as Record<string, unknown>;
  assert.equal(outcome.schema_version, "ucf-yjs.outcome.v1");
  assert.equal(typeof outcome.outcome_hash, "string");
  assert.equal("response_digest" in outcome, false);
  assert.equal(validateOutcomeEnvelope(outcome).ok, true);
  assert.equal(validateObservationResponseEnvelope(outcome).ok, false);
});
