import test from "node:test";
import assert from "node:assert/strict";

import { COMMAND_SCHEMA_VERSION, type CommandEnvelope } from "../packages/protocol/src/index.js";
import { SemanticLog, validateSemanticLog, type OutcomeLogRecord, type SemanticLogRecord } from "../packages/semantic-log/src/index.js";

function command(overrides: Partial<CommandEnvelope> = {}): CommandEnvelope {
  return {
    schema_version: COMMAND_SCHEMA_VERSION,
    command_id: "cmd-1",
    idempotency_key: "idem-1",
    actor: { actor_id: "actor-1", kind: "agent" },
    workspace_id: "ws-1",
    operation: "citation.activate",
    target: { kind: "document", document_id: "doc-1" },
    payload: { handle: "AUTH-ROTATE" },
    ...overrides
  };
}

test("semantic log appends one command, idempotency decision, and outcome", () => {
  const log = new SemanticLog();
  const result = log.append(command(), {
    outcome: "committed",
    code: "UCFY_OK",
    previous_live_version: null,
    new_live_version: "sha256:" + "1".repeat(64),
    affected_resources: [{ kind: "citation", id: "AUTH-ROTATE" }]
  });

  assert.equal(result.decision, "new");
  assert.equal(result.command_appended, true);
  assert.equal(result.outcome_appended, true);
  assert.equal(result.outcome.workspace_sequence, 1);
  assert.equal(result.outcome.previous_outcome_hash, null);
  assert.match(result.outcome.outcome_hash, /^sha256:[0-9a-f]{64}$/);
  assert.equal(log.snapshot().length, 3);
  assert.deepEqual(validateSemanticLog(log.snapshot()), {
    ok: true,
    frontier: { workspace_sequence: 1, outcome_hash: result.outcome.outcome_hash }
  });
});

test("duplicate idempotency key with same payload returns original outcome without another outcome", () => {
  const log = new SemanticLog();
  const first = log.append(command(), {
    outcome: "committed",
    code: "UCFY_OK",
    previous_live_version: null,
    new_live_version: "sha256:" + "1".repeat(64)
  });
  const retry = log.append(command({ command_id: "cmd-retry" }), {
    outcome: "committed",
    code: "UCFY_OK",
    previous_live_version: null,
    new_live_version: "sha256:" + "2".repeat(64)
  });

  assert.equal(retry.decision, "duplicate_same_payload");
  assert.equal(retry.command_appended, false);
  assert.equal(retry.outcome_appended, false);
  assert.equal(retry.outcome.outcome_hash, first.outcome.outcome_hash);
  assert.equal(log.outcomes().length, 1);
  assert.equal(validateSemanticLog(log.snapshot()).ok, true);
});

test("duplicate idempotency key with different payload appends conflict outcome", () => {
  const log = new SemanticLog();
  log.append(command(), {
    outcome: "committed",
    code: "UCFY_OK",
    previous_live_version: null,
    new_live_version: "sha256:" + "1".repeat(64)
  });
  const conflict = log.append(command({ command_id: "cmd-2", payload: { handle: "AUTH-OTHER" } }), {
    outcome: "committed",
    code: "UCFY_OK",
    previous_live_version: "sha256:" + "1".repeat(64),
    new_live_version: "sha256:" + "2".repeat(64)
  });

  assert.equal(conflict.decision, "conflict_different_payload");
  assert.equal(conflict.outcome.outcome, "conflict");
  assert.equal(conflict.outcome.code, "UCFY_CONFLICT_IDEMPOTENCY_PAYLOAD");
  assert.equal(conflict.outcome.workspace_sequence, 2);
  assert.equal(log.outcomes().length, 2);
  assert.equal(validateSemanticLog(log.snapshot()).ok, true);
});

test("repeated different-payload idempotency retry returns the first conflict outcome", () => {
  const log = new SemanticLog();
  log.append(command(), {
    outcome: "committed",
    code: "UCFY_OK",
    previous_live_version: null,
    new_live_version: "sha256:" + "1".repeat(64)
  });
  const firstConflict = log.append(command({ command_id: "cmd-2", payload: { handle: "AUTH-OTHER" } }), {
    outcome: "committed",
    code: "UCFY_OK",
    previous_live_version: "sha256:" + "1".repeat(64),
    new_live_version: "sha256:" + "2".repeat(64)
  });
  const retryConflict = log.append(command({ command_id: "cmd-3", payload: { handle: "AUTH-OTHER" } }), {
    outcome: "committed",
    code: "UCFY_OK",
    previous_live_version: "sha256:" + "1".repeat(64),
    new_live_version: "sha256:" + "3".repeat(64)
  });

  assert.equal(retryConflict.decision, "duplicate_same_payload");
  assert.equal(retryConflict.outcome.outcome_hash, firstConflict.outcome.outcome_hash);
  assert.equal(log.outcomes().length, 2);
  assert.equal(validateSemanticLog(log.snapshot()).ok, true);
});

test("semantic log stores immutable copies of command, draft arrays, and returned outcomes", () => {
  const log = new SemanticLog();
  const mutableCommand = command();
  const affected = [{ kind: "citation", id: "AUTH-ROTATE" }];
  const result = log.append(mutableCommand, {
    outcome: "committed",
    code: "UCFY_OK",
    previous_live_version: null,
    new_live_version: "sha256:" + "1".repeat(64),
    affected_resources: affected
  });
  (mutableCommand as unknown as { payload: { handle: string } }).payload = { handle: "MUTATED" };
  affected[0] = { kind: "citation", id: "MUTATED" };
  (result.outcome.affected_resources as { kind: string; id: string }[])[0] = {
    kind: "citation",
    id: "RETURN-MUTATED"
  };

  assert.equal(validateSemanticLog(log.snapshot()).ok, true);
  assert.deepEqual(log.outcomes()[0]?.affected_resources, [{ kind: "citation", id: "AUTH-ROTATE" }]);
});

test("semantic log validation detects command without outcome on recovery", () => {
  const log = new SemanticLog();
  log.append(command(), {
    outcome: "committed",
    code: "UCFY_OK",
    previous_live_version: null,
    new_live_version: "sha256:" + "1".repeat(64)
  });

  const damaged = log.snapshot().filter((record) => record.record_type !== "outcome");
  const result = validateSemanticLog(damaged);
  assert.equal(result.ok, false);
  assert.equal(result.ok ? "" : result.issues.some((issue) => issue.code === "LOG_MISSING_OUTCOME"), true);
});

test("semantic log validation detects gaps, duplicates, and mismatched hashes", () => {
  const log = new SemanticLog();
  log.append(command(), {
    outcome: "committed",
    code: "UCFY_OK",
    previous_live_version: null,
    new_live_version: "sha256:" + "1".repeat(64)
  });
  const snapshot = [...log.snapshot()] as SemanticLogRecord[];
  const outcome = snapshot.find((record): record is OutcomeLogRecord => record.record_type === "outcome");
  assert.ok(outcome);
  const damagedOutcome: OutcomeLogRecord = {
    ...outcome,
    workspace_sequence: 3,
    outcome_hash: "sha256:" + "9".repeat(64)
  };
  const damaged = [...snapshot, snapshot[0]!, damagedOutcome];
  const result = validateSemanticLog(damaged);

  assert.equal(result.ok, false);
  assert.equal(result.ok ? "" : result.issues.some((issue) => issue.code === "LOG_DUPLICATE_COMMAND"), true);
  assert.equal(result.ok ? "" : result.issues.some((issue) => issue.code === "LOG_GAP"), true);
  assert.equal(result.ok ? "" : result.issues.some((issue) => issue.code === "LOG_HASH_MISMATCH"), true);
});

test("semantic log validation detects corrupted idempotency original references", () => {
  const log = new SemanticLog();
  log.append(command(), {
    outcome: "committed",
    code: "UCFY_OK",
    previous_live_version: null,
    new_live_version: "sha256:" + "1".repeat(64)
  });
  log.append(command({ command_id: "cmd-retry" }), {
    outcome: "committed",
    code: "UCFY_OK",
    previous_live_version: null,
    new_live_version: "sha256:" + "2".repeat(64)
  });

  const damaged = log.snapshot().map((record) =>
    record.record_type === "idempotency" && record.decision === "duplicate_same_payload"
      ? { ...record, original_payload_digest: "sha256:" + "8".repeat(64) }
      : record
  );
  const result = validateSemanticLog(damaged);
  assert.equal(result.ok, false);
  assert.equal(result.ok ? "" : result.issues.some((issue) => issue.code === "LOG_IDEMPOTENCY_MISMATCH"), true);
});
