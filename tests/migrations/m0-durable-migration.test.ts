import { readFile, writeFile, mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import assert from "node:assert/strict";

import { LocalProvider } from "../../packages/provider-local/src/index.js";
import { createCommand, type WorkspaceProcessorSnapshot } from "../../packages/command-processor/src/index.js";
import {
  WorkspaceGenerationError,
  inspectWorkspaceGeneration,
  migrateM0LocalWorkspace,
  openDurableWorkspace,
  submitDurableCommand,
  type GenerationPhase
} from "../../packages/runtime/src/index.js";
import { canonicalJson, type JsonObject } from "../../packages/protocol/src/index.js";
import type { SemanticLogRecord } from "../../packages/semantic-log/src/index.js";

const fixturePath = join(process.cwd(), "tests", "fixtures", "m0-local-workspace.json");
const workspace_id = "m0-fixture-workspace";
const capability = { actor_id: "m1-migration-test", can_read_content: true, can_write: true, can_accept: true };

test("M0 local workspace fixture migrates to durable M1 authority", async () => {
  const dir = await mkdtemp(join(tmpdir(), "ucf-yjs-m0-migration-"));
  try {
    const sourcePath = join(dir, "m0-local-workspace.json");
    const fixtureBytes = await readFile(fixturePath);
    await writeFile(sourcePath, fixtureBytes);
    const fixture = JSON.parse(Buffer.from(fixtureBytes).toString("utf8")) as { readonly authority: WorkspaceProcessorSnapshot };
    const checkpointId = fixture.authority.checkpoints[0]?.checkpoint_id;
    const m0StatusOutcome = fixture.authority.semantic_log.find(
      (record): record is Extract<SemanticLogRecord, { readonly record_type: "outcome" }> =>
        record.record_type === "outcome" && record.command_id === "m0-status-read"
    );
    assert.notEqual(checkpointId, undefined);
    assert.notEqual(m0StatusOutcome, undefined);

    const migrated = await migrateM0LocalWorkspace(dir, workspace_id, sourcePath, {
      actor_id: "m1-migration-test",
      created_at: "2026-07-31T00:00:00.000Z"
    });
    assert.equal(migrated.ok, true);
    assert.equal(migrated.ok ? migrated.classification : "", "migrated");
    assert.equal(await readFile(sourcePath, "utf8"), Buffer.from(fixtureBytes).toString("utf8"));
    assert.notEqual((await LocalProvider.open(sourcePath)).authoritySnapshot(), null);

    const reopened = await openDurableWorkspace(dir, workspace_id);
    assert.notEqual(reopened, null);
    assert.equal(reopened?.ydoc.getText("doc-1").toString(), "Alpha beta");
    assert.equal(reopened?.processor.checkpoints.snapshot()[0]?.checkpoint_id, checkpointId);
    assert.equal(
      canonicalJson(reopened?.processor.semanticLog.snapshot() as unknown as JsonObject),
      canonicalJson(fixture.authority.semantic_log as unknown as JsonObject)
    );
    assert.equal(reopened?.processor.submit(statusCommand("m0-status-read"), capability).outcome.outcome_hash, m0StatusOutcome?.outcome_hash);

    const again = await migrateM0LocalWorkspace(dir, workspace_id, sourcePath, { actor_id: "m1-migration-test" });
    assert.equal(again.ok, true);
    assert.equal(again.ok ? again.classification : "", "already_migrated");
    assert.equal(again.ok && migrated.ok ? again.generation_id : "", migrated.ok ? migrated.generation_id : "");

    const beforeFrontier = reopened?.processor.projections(capability).workspace_status.semantic_frontier;
    const observed = await submitDurableCommand({ root: dir, workspace_id, command: statusCommand("m1-status-observation"), capability });
    assert.equal(observed.generation_published, false);
    const afterObservation = await openDurableWorkspace(dir, workspace_id);
    assert.deepEqual(afterObservation?.processor.projections(capability).workspace_status.semantic_frontier, beforeFrontier);

    const mutated = await submitDurableCommand({
      root: dir,
      workspace_id,
      command: createCommand({
        command_id: "m1-first-mutation",
        idempotency_key: "idem-m1-first-mutation",
        actor: { actor_id: "m1-migration-test", kind: "agent" },
        workspace_id,
        operation: "document.replace_range",
        target: { kind: "document", document_id: "doc-1" },
        payload: { start: 6, end: 10, text: "gamma" }
      }),
      capability
    });
    assert.equal(mutated.generation_published, true);
    const mutationOutcome = mutated.result.outcome;
    assert.equal(mutationOutcome.workspace_sequence, (beforeFrontier?.workspace_sequence ?? 0) + 1);
    assert.equal(mutationOutcome.previous_outcome_hash, beforeFrontier?.outcome_hash);
    assert.equal((await openDurableWorkspace(dir, workspace_id))?.ydoc.getText("doc-1").toString(), "Alpha gamma");
    const afterDescendant = await migrateM0LocalWorkspace(dir, workspace_id, sourcePath, { actor_id: "m1-migration-test" });
    assert.equal(afterDescendant.ok, true);
    assert.equal(afterDescendant.ok ? afterDescendant.classification : "", "already_migrated");
    assert.equal(afterDescendant.ok ? afterDescendant.generation_id : "", mutated.generation_id);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test("failed M0 migration preserves the source authority", async () => {
  for (const phase of ["prepared", "material_written", "validated", "published", "committed"] as readonly GenerationPhase[]) {
    const dir = await mkdtemp(join(tmpdir(), `ucf-yjs-m0-migration-${phase}-`));
    try {
      const sourcePath = join(dir, "m0-local-workspace.json");
      const fixtureBytes = await readFile(fixturePath);
      await writeFile(sourcePath, fixtureBytes);
      await assert.rejects(
        migrateM0LocalWorkspace(dir, workspace_id, sourcePath, {
          actor_id: "m1-migration-test",
          fault_injection: { fail_after_phase: phase }
        }),
        WorkspaceGenerationError
      );
      assert.equal(await readFile(sourcePath, "utf8"), Buffer.from(fixtureBytes).toString("utf8"));
      assert.notEqual((await LocalProvider.open(sourcePath)).authoritySnapshot(), null);
      const inspected = await inspectWorkspaceGeneration(dir, workspace_id);
      assert.notEqual(inspected.classification, "divergence");
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  }
});

test("unsupported M0 local workspace variants fail typed", async () => {
  const dir = await mkdtemp(join(tmpdir(), "ucf-yjs-m0-migration-unsupported-"));
  try {
    const sourcePath = join(dir, "unsupported.json");
    const fixture = JSON.parse(await readFile(fixturePath, "utf8")) as Record<string, unknown>;
    await writeFile(sourcePath, JSON.stringify({ ...fixture, schema_version: "ucf-yjs.local_workspace_snapshot.v999" }), "utf8");
    const result = await migrateM0LocalWorkspace(dir, workspace_id, sourcePath, { actor_id: "m1-migration-test" });
    assert.equal(result.ok, false);
    assert.equal(result.ok ? "" : result.code, "UCFY_REJECTED_UNSUPPORTED_SCHEMA");
    assert.equal(result.ok ? "" : result.classification, "unsupported_m0_workspace");
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

function statusCommand(command_id: string) {
  return createCommand({
    command_id,
    idempotency_key: `idem-${command_id}`,
    actor: { actor_id: "m1-migration-test", kind: "agent" },
    workspace_id,
    operation: "status.get",
    target: { kind: "workspace" },
    payload: {}
  });
}
