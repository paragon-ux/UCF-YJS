import test from "node:test";
import assert from "node:assert/strict";

import {
  OBSERVATION_RESPONSE_SCHEMA_VERSION,
  domainHash,
  validateObservationResponseEnvelope,
  type JsonObject,
  type ObservationResponseEnvelope
} from "../../packages/protocol/src/index.js";

const withoutDigest: Omit<ObservationResponseEnvelope, "response_digest"> = {
  schema_version: OBSERVATION_RESPONSE_SCHEMA_VERSION,
  record_kind: "observation_response",
  command_id: "cmd-status",
  outcome: "committed",
  code: "UCFY_OK",
  workspace_sequence: 4,
  previous_outcome_hash: "sha256:" + "1".repeat(64),
  previous_live_version: "sha256:" + "2".repeat(64),
  new_live_version: "sha256:" + "2".repeat(64),
  affected_resources: [],
  events: [{ type: "status.get", observation: true }],
  allowed_actions: [],
  diagnostics: []
};

const valid: ObservationResponseEnvelope = {
  ...withoutDigest,
  response_digest: domainHash("ucf-yjs.observation_response.v1", withoutDigest as unknown as JsonObject)
};

test("observation response requires and verifies response_digest", () => {
  assert.equal(validateObservationResponseEnvelope(valid).ok, true);

  const { response_digest: _responseDigest, ...missingDigest } = valid;
  const missing = validateObservationResponseEnvelope(missingDigest);
  assert.equal(missing.ok, false);
  assert.equal(missing.ok ? false : missing.issues.some((item) => item.path === "$.response_digest"), true);

  const malformed = validateObservationResponseEnvelope({ ...valid, response_digest: "not-a-digest" });
  assert.equal(malformed.ok, false);
  assert.equal(malformed.ok ? false : malformed.issues.some((item) => item.path === "$.response_digest"), true);

  const mismatched = validateObservationResponseEnvelope({ ...valid, response_digest: "sha256:" + "0".repeat(64) });
  assert.equal(mismatched.ok, false);
  assert.equal(mismatched.ok ? false : mismatched.issues.some((item) => item.path === "$.response_digest"), true);
});

test("changing observation response content requires a new digest", () => {
  const changed = validateObservationResponseEnvelope({ ...valid, workspace_sequence: valid.workspace_sequence + 1 });
  assert.equal(changed.ok, false);
  assert.equal(changed.ok ? false : changed.issues.some((item) => item.path === "$.response_digest"), true);
});
