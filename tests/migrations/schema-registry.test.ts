import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

import { createCommand } from "../../packages/command-processor/src/index.js";
import {
  SCHEMA_REGISTRY,
  compatibilityFor,
  migrateM0SemanticFrontierToV2,
  migrateIdentityArtifact,
  validateSchemaRegistry,
  type JsonValue,
  type SchemaRegistry
} from "../../packages/protocol/src/index.js";
import { SemanticLog } from "../../packages/semantic-log/src/index.js";

test("schema registry validates deterministically", () => {
  const result = validateSchemaRegistry();
  assert.equal(result.ok, true);
});

test("checked-in JSON registry matches the TypeScript registry", async () => {
  const text = await readFile("schemas/registry.json", "utf8");
  const parsed = JSON.parse(text) as SchemaRegistry;
  assert.deepEqual(parsed, SCHEMA_REGISTRY);
  assert.equal(validateSchemaRegistry(parsed).ok, true);
});

test("schema registry rejects duplicates, missing artifacts, and out-of-order entries", () => {
  const duplicate: SchemaRegistry = {
    ...SCHEMA_REGISTRY,
    entries: [SCHEMA_REGISTRY.entries[1]!, SCHEMA_REGISTRY.entries[0]!, SCHEMA_REGISTRY.entries[0]!]
  };
  const result = validateSchemaRegistry(duplicate);
  assert.equal(result.ok, false);
  assert.equal(result.ok ? "" : result.issues.some((item) => item.code === "REGISTRY_DUPLICATE_ENTRY"), true);
  assert.equal(result.ok ? "" : result.issues.some((item) => item.code === "REGISTRY_OUT_OF_ORDER"), true);
  assert.equal(result.ok ? "" : result.issues.some((item) => item.code === "REGISTRY_MISSING_ARTIFACT"), true);
});

test("registry compatibility returns typed unsupported-version behavior", () => {
  assert.deepEqual(compatibilityFor("command_schema", "ucf-yjs.command.v1"), { ok: true, mode: "read_write" });
  assert.deepEqual(compatibilityFor("workspace_generation_schema", "ucf-yjs.workspace_generation.v1"), { ok: true, mode: "read_write" });
  assert.deepEqual(compatibilityFor("workspace_generation_schema", "ucf-yjs.workspace_generation.v999"), {
    ok: false,
    code: "UCFY_REJECTED_UNSUPPORTED_SCHEMA",
    artifact: "workspace_generation_schema",
    version: "ucf-yjs.workspace_generation.v999"
  });
  assert.deepEqual(compatibilityFor("command_schema", "ucf-yjs.command.v999"), {
    ok: false,
    code: "UCFY_REJECTED_UNSUPPORTED_SCHEMA",
    artifact: "command_schema",
    version: "ucf-yjs.command.v999"
  });
});

test("identity migrations preserve canonical artifact content without aliasing", () => {
  const artifact = {
    schema_version: "ucf-yjs.command.v1",
    payload: { nested: ["alpha", "beta"] }
  } satisfies JsonValue;
  const migrated = migrateIdentityArtifact("command_schema", "ucf-yjs.command.v1", "ucf-yjs.command.v1", artifact);
  assert.deepEqual(migrated, artifact);
  assert.notEqual(migrated, artifact);
  assert.throws(
    () => migrateIdentityArtifact("command_schema", "ucf-yjs.command.v999", "ucf-yjs.command.v1", artifact),
    /unsupported schema migration/
  );
});

test("M0 semantic frontier profile migrates to the M1 observational-read profile", () => {
  const m0Frontier = { workspace_sequence: 3, outcome_hash: "sha256:" + "a".repeat(64) };
  const migrated = migrateM0SemanticFrontierToV2(m0Frontier);
  assert.deepEqual(migrated, {
    schema_version: "ucf-yjs.semantic_frontier_migration.v1",
    from_profile: "ucf-yjs.semantic_frontier.v1",
    to_profile: "ucf-yjs.semantic_frontier.v2",
    m0_frontier_anchor: m0Frontier,
    observation_policy: "status_and_agent_view_do_not_advance"
  });
  assert.notEqual(migrated.m0_frontier_anchor, m0Frontier);
});

test("historical M0 semantic logs with read outcomes remain valid", () => {
  const log = new SemanticLog();
  const statusCommand = createCommand({
    command_id: "cmd-m0-status",
    idempotency_key: "idem-cmd-m0-status",
    actor: { actor_id: "actor-1", kind: "agent" },
    workspace_id: "ws-1",
    operation: "status.get",
    target: { kind: "workspace" },
    payload: {}
  });
  const appended = log.append(statusCommand, {
    outcome: "committed",
    code: "UCFY_OK",
    previous_live_version: null,
    new_live_version: "sha256:" + "b".repeat(64),
    events: [{ type: "status.get" }]
  });
  const reloaded = new SemanticLog(log.snapshot());
  const migrated = migrateM0SemanticFrontierToV2(reloaded.frontier() as unknown as JsonValue);

  assert.equal(appended.outcome.workspace_sequence, 1);
  assert.deepEqual(reloaded.frontier(), log.frontier());
  assert.deepEqual(migrated.m0_frontier_anchor, log.frontier());
});
