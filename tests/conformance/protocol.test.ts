import test from "node:test";
import assert from "node:assert/strict";

import {
  COMMAND_SCHEMA_VERSION,
  OUTCOME_SCHEMA_VERSION,
  canonicalJson,
  commandPayloadDigest,
  domainHash,
  outcomeRecordHash,
  validateCommandEnvelope,
  validateOutcomeEnvelope,
  type CommandEnvelope,
  type OutcomeEnvelope
} from "../../packages/protocol/src/index.js";

const command: CommandEnvelope = {
  schema_version: COMMAND_SCHEMA_VERSION,
  command_id: "cmd-1",
  idempotency_key: "idem-1",
  actor: { actor_id: "actor-1", kind: "agent" },
  workspace_id: "ws-1",
  observed: { live_version: "sha256:" + "0".repeat(64) },
  operation: "citation.activate",
  target: { kind: "document", document_id: "doc-1" },
  payload: { handle: "AUTH-ROTATE", range: { start: 0, end: 5 } }
};

test("canonical JSON is stable across object key order", () => {
  assert.equal(
    canonicalJson({ b: 2, a: { z: "\u00e9", y: [true, null] } }),
    canonicalJson({ a: { y: [true, null], z: "e\u0301" }, b: 2 })
  );
});

test("canonical JSON normalizes object keys", () => {
  assert.equal(canonicalJson({ "\u00e9": "value" }), canonicalJson({ "e\u0301": "value" }));
});

test("domain hashes differ across domains", () => {
  const value = { a: 1 };
  assert.notEqual(domainHash("domain.a", value), domainHash("domain.b", value));
});

test("semantically identical command payloads hash identically", () => {
  const reordered = {
    payload: { range: { end: 5, start: 0 }, handle: "AUTH-ROTATE" },
    target: { document_id: "doc-1", kind: "document" },
    operation: "citation.activate"
  };
  assert.equal(commandPayloadDigest(command), commandPayloadDigest(reordered));
});

test("unsupported command schema version has stable rejection code", () => {
  const result = validateCommandEnvelope({ ...command, schema_version: "ucf-yjs.command.v999" });
  assert.equal(result.ok, false);
  assert.equal(result.ok ? "" : result.issues[0]?.code, "UCFY_REJECTED_UNSUPPORTED_SCHEMA");
});

test("command validation rejects provider-specific fields", () => {
  const result = validateCommandEnvelope({ ...command, provider_snapshot_id: "snap-1" });
  assert.equal(result.ok, false);
  assert.equal(result.ok ? "" : result.issues[0]?.code, "UCFY_REJECTED_SCHEMA");
});

test("command validation rejects nested provider-specific fields", () => {
  const result = validateCommandEnvelope({
    ...command,
    payload: { ...command.payload, nested: { raw_yjs_update: "opaque-update" } }
  });
  assert.equal(result.ok, false);
  assert.equal(result.ok ? "" : result.issues.some((item) => item.path === "$.payload.nested.raw_yjs_update"), true);
});

test("command validation rejects non-JSON payload values", () => {
  const result = validateCommandEnvelope({ ...command, payload: { bad: undefined } });
  assert.equal(result.ok, false);
  assert.equal(result.ok ? "" : result.issues.some((item) => item.path === "$.payload.bad"), true);
});

test("command validation rejects non-JSON envelope extras", () => {
  const result = validateCommandEnvelope({ ...command, extra: () => "not-json" });
  assert.equal(result.ok, false);
  assert.equal(result.ok ? "" : result.issues.some((item) => item.path === "$.extra"), true);
});

test("valid command envelope passes schema validation", () => {
  const result = validateCommandEnvelope(command);
  assert.equal(result.ok, true);
});

test("outcome record hash excludes only non-authoritative outcome fields", () => {
  const outcome: OutcomeEnvelope = {
    schema_version: OUTCOME_SCHEMA_VERSION,
    command_id: "cmd-1",
    outcome: "committed",
    code: "UCFY_OK",
    workspace_sequence: 1,
    previous_outcome_hash: null,
    outcome_hash: "sha256:" + "f".repeat(64),
    previous_live_version: null,
    new_live_version: "sha256:" + "1".repeat(64),
    affected_resources: [],
    events: [],
    allowed_actions: [],
    diagnostics: []
  };
  assert.equal(outcomeRecordHash(outcome), outcomeRecordHash({ ...outcome, outcome_hash: "sha256:" + "e".repeat(64) }));
  assert.equal(outcomeRecordHash(outcome), outcomeRecordHash({ ...outcome, new_live_version: "sha256:" + "2".repeat(64) }));
  assert.notEqual(outcomeRecordHash(outcome), outcomeRecordHash({ ...outcome, code: "UCFY_CONFLICT_CHANGED_EVIDENCE", outcome: "conflict" }));
  assert.notEqual(outcomeRecordHash(outcome), outcomeRecordHash({ ...outcome, events: [{ type: "changed" }] }));
  assert.equal(validateOutcomeEnvelope(outcome).ok, true);
});

test("missing outcome schema version has schema rejection code", () => {
  const result = validateOutcomeEnvelope({ command_id: "cmd-1" });
  assert.equal(result.ok, false);
  assert.equal(result.ok ? "" : result.issues[0]?.code, "UCFY_REJECTED_SCHEMA");
});

test("outcome validation enforces typed arrays", () => {
  const result = validateOutcomeEnvelope({
    schema_version: OUTCOME_SCHEMA_VERSION,
    command_id: "cmd-1",
    outcome: "committed",
    code: "UCFY_OK",
    workspace_sequence: 1,
    previous_outcome_hash: null,
    previous_live_version: null,
    new_live_version: null,
    affected_resources: ["doc-1"],
    events: [],
    allowed_actions: [5],
    diagnostics: []
  });
  assert.equal(result.ok, false);
  assert.equal(result.ok ? "" : result.issues.some((item) => item.path === "$.affected_resources[0]"), true);
  assert.equal(result.ok ? "" : result.issues.some((item) => item.path === "$.allowed_actions[0]"), true);
});

test("outcome validation rejects unsupported codes", () => {
  const result = validateOutcomeEnvelope({
    schema_version: OUTCOME_SCHEMA_VERSION,
    command_id: "cmd-1",
    outcome: "committed",
    code: "UCFY_NOT_A_CODE",
    workspace_sequence: 1,
    previous_outcome_hash: null,
    previous_live_version: null,
    new_live_version: null,
    affected_resources: [],
    events: [],
    allowed_actions: [],
    diagnostics: []
  });
  assert.equal(result.ok, false);
  assert.equal(result.ok ? "" : result.issues.some((item) => item.path === "$.code"), true);
});

test("outcome validation requires nullable frontier fields", () => {
  const result = validateOutcomeEnvelope({
    schema_version: OUTCOME_SCHEMA_VERSION,
    command_id: "cmd-1",
    outcome: "committed",
    code: "UCFY_OK",
    workspace_sequence: 1,
    affected_resources: [],
    events: [],
    allowed_actions: [],
    diagnostics: []
  });
  assert.equal(result.ok, false);
  assert.equal(result.ok ? "" : result.issues.some((item) => item.path === "$.previous_outcome_hash"), true);
  assert.equal(result.ok ? "" : result.issues.some((item) => item.path === "$.previous_live_version"), true);
  assert.equal(result.ok ? "" : result.issues.some((item) => item.path === "$.new_live_version"), true);
});

test("outcome validation rejects non-JSON envelope extras", () => {
  const result = validateOutcomeEnvelope({
    schema_version: OUTCOME_SCHEMA_VERSION,
    command_id: "cmd-1",
    outcome: "committed",
    code: "UCFY_OK",
    workspace_sequence: 1,
    previous_outcome_hash: null,
    previous_live_version: null,
    new_live_version: null,
    affected_resources: [],
    events: [],
    allowed_actions: [],
    diagnostics: [],
    extra: Symbol("bad")
  });
  assert.equal(result.ok, false);
  assert.equal(result.ok ? "" : result.issues.some((item) => item.path === "$.extra"), true);
});
