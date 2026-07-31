import { existsSync, readdirSync, readFileSync } from "node:fs";
import { readFile, writeFile, mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import assert from "node:assert/strict";

import * as Y from "yjs";

import { WorkspaceProcessor, createCommand } from "../../packages/command-processor/src/index.js";
import {
  WorkspaceGenerationError,
  exportProviderState,
  importProviderState,
  inspectWorkspaceGeneration,
  openDurableWorkspace,
  publishWorkspaceGeneration,
  recoverWorkspaceGeneration,
  resolveWorkspaceRecovery,
  submitDurableCommand,
  validateDurableWorkspace,
  workspaceStorePath,
  type CurrentPointer,
  type WorkspaceGenerationManifest
} from "../../packages/runtime/src/index.js";
import { canonicalJson, domainHash, type JsonObject } from "../../packages/protocol/src/index.js";
import type { CapabilityContext } from "../../packages/projections/src/index.js";

const capability: CapabilityContext = { actor_id: "runtime-test", can_read_content: true, can_write: true, can_accept: true };

test("workspace generation publish and reopen preserves authority planes", async () => {
  const dir = await mkdtemp(join(tmpdir(), "ucf-yjs-generation-"));
  try {
    const { processor, ydoc } = processorWithDocument("ws-1", "Alpha beta");
    processor.submit(command("ws-1", "cmd-cite", "citation.activate", { kind: "document", document_id: "doc-1" }, { citation_id: "c1", start: 0, end: 5, expected_text: "Alpha" }), capability);
    processor.submit(command("ws-1", "cmd-checkpoint", "checkpoint.create", { kind: "workspace" }, {}), capability);

    const manifest = await publishWorkspaceGeneration({ root: dir, workspace_id: "ws-1", processor, ydoc });
    const reopened = await openDurableWorkspace(dir, "ws-1");

    assert.notEqual(reopened, null);
    assert.equal(reopened?.generation.generation_id, manifest.generation_id);
    assert.equal(reopened?.processor.projections(capability).workspace_status.semantic_frontier.workspace_sequence, 3);
    assert.equal(reopened?.processor.checkpoints.snapshot()[0]?.checkpoint_id, processor.checkpoints.snapshot()[0]?.checkpoint_id);
    assert.equal(reopened?.ydoc.getText("doc-1").toString(), "Alpha beta");
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test("workspace identifiers use a safe injective path mapping", async () => {
  const dir = await mkdtemp(join(tmpdir(), "ucf-yjs-generation-paths-"));
  try {
    const invalid = ["", ".", "..", "a/b", "a\\b", "C:alias", "\\\\server\\share", "name.", "name ", "CON", "LPT1", "e\u0301"];
    for (const workspace_id of invalid) {
      assert.throws(() => workspaceStorePath(dir, workspace_id), WorkspaceGenerationError, workspace_id);
    }
    const first = workspaceStorePath(dir, "é");
    const second = workspaceStorePath(dir, "workspace.local");
    assert.notEqual(first, second);
    assert.equal(first.startsWith(join(dir, ".ucf-yjs", "workspaces")), true);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test("phase fault recovery leaves previous or intended generation active", async () => {
  for (const phase of ["prepared", "material_written", "validated", "published", "committed"] as const) {
    const dir = await mkdtemp(join(tmpdir(), `ucf-yjs-generation-${phase}-`));
    try {
      const previous = processorWithDocument("ws-1", "Alpha");
      const previousManifest = await publishWorkspaceGeneration({ root: dir, workspace_id: "ws-1", ...previous });
      const intended = processorWithDocument("ws-1", `Alpha ${phase}`);
      await assert.rejects(
        publishWorkspaceGeneration({ root: dir, workspace_id: "ws-1", ...intended, fault_injection: { fail_after_phase: phase } }),
        WorkspaceGenerationError
      );
      const inspected = await inspectWorkspaceGeneration(dir, "ws-1");
      if (phase === "prepared") {
        const active = await openDurableWorkspace(dir, "ws-1");
        assert.notEqual(active, null);
        assert.equal(inspected.active_generation_id, previousManifest.generation_id);
        assert.equal(active?.ydoc.getText("doc-1").toString(), "Alpha");
      } else if (phase === "committed") {
        const active = await openDurableWorkspace(dir, "ws-1");
        assert.notEqual(active, null);
        assert.equal(inspected.classification, "clean");
        assert.equal(active?.ydoc.getText("doc-1").toString(), `Alpha ${phase}`);
      } else {
        assert.equal(inspected.classification, "recovery_required");
        await assert.rejects(openDurableWorkspace(dir, "ws-1"), WorkspaceGenerationError);
        const recovery = await resolveWorkspaceRecovery(dir, "ws-1");
        const active = await openDurableWorkspace(dir, "ws-1");
        assert.equal(recovery.classification, "recovered");
        assert.equal(active?.ydoc.getText("doc-1").toString(), `Alpha ${phase}`);
      }
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  }
});

test("repeated recovery is idempotent and does not duplicate semantic records", async () => {
  const dir = await mkdtemp(join(tmpdir(), "ucf-yjs-generation-idempotent-"));
  try {
    const state = processorWithDocument("ws-1", "Alpha");
    await assert.rejects(
      publishWorkspaceGeneration({ root: dir, workspace_id: "ws-1", ...state, fault_injection: { fail_after_phase: "material_written" } }),
      WorkspaceGenerationError
    );
    const firstInspection = await recoverWorkspaceGeneration(dir, "ws-1");
    await assert.rejects(openDurableWorkspace(dir, "ws-1"), WorkspaceGenerationError);
    const first = await resolveWorkspaceRecovery(dir, "ws-1");
    const reopened = await openDurableWorkspace(dir, "ws-1");
    const semanticCount = reopened?.processor.semanticLog.snapshot().length;
    const second = await resolveWorkspaceRecovery(dir, "ws-1");
    const reopenedAgain = await openDurableWorkspace(dir, "ws-1");
    assert.equal(firstInspection.classification, "recovery_required");
    assert.equal(first.classification, "recovered");
    assert.equal(second.classification, "clean");
    assert.equal(reopenedAgain?.processor.semanticLog.snapshot().length, semanticCount);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test("component divergence fails closed without changing active generation", async () => {
  const dir = await mkdtemp(join(tmpdir(), "ucf-yjs-generation-divergence-"));
  try {
    const previous = processorWithDocument("ws-1", "Alpha");
    const previousManifest = await publishWorkspaceGeneration({ root: dir, workspace_id: "ws-1", ...previous });
    const intended = processorWithDocument("ws-1", "Beta");
    await assert.rejects(
      publishWorkspaceGeneration({ root: dir, workspace_id: "ws-1", ...intended, fault_injection: { fail_after_phase: "material_written" } }),
      WorkspaceGenerationError
    );
    const pendingId = newestGenerationId(dir, "ws-1", previousManifest.generation_id);
    const pendingPath = generationPath(dir, "ws-1", pendingId);
    const pendingManifest = JSON.parse(await readFile(join(pendingPath, "manifest.json"), "utf8")) as { readonly generation_id: string };
    const componentPath = join(generationPath(dir, "ws-1", pendingManifest.generation_id), "components", "semantic-log.json");
    await writeFile(componentPath, "[]", "utf8");

    const recovery = await resolveWorkspaceRecovery(dir, "ws-1");
    const active = await openDurableWorkspace(dir, "ws-1").catch((error: unknown) => error);
    assert.equal(recovery.classification, "divergence");
    assert.equal(recovery.active_generation_id, previousManifest.generation_id);
    assert.equal(active instanceof WorkspaceGenerationError, true);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test("inspection and open preserve pending generation bytes", async () => {
  const dir = await mkdtemp(join(tmpdir(), "ucf-yjs-generation-inspect-pure-"));
  try {
    const previous = processorWithDocument("ws-1", "Alpha");
    const previousManifest = await publishWorkspaceGeneration({ root: dir, workspace_id: "ws-1", ...previous });
    const intended = processorWithDocument("ws-1", "Beta");
    await assert.rejects(
      publishWorkspaceGeneration({ root: dir, workspace_id: "ws-1", ...intended, fault_injection: { fail_after_phase: "material_written" } }),
      WorkspaceGenerationError
    );
    const workspacePath = workspaceStorePath(dir, "ws-1");
    const pointerPath = join(workspacePath, "current.json");
    const pendingId = newestGenerationId(dir, "ws-1", previousManifest.generation_id);
    const pendingManifestPath = join(generationPath(dir, "ws-1", pendingId), "manifest.json");
    const beforePointer = await readFile(pointerPath, "utf8");
    const beforeManifest = await readFile(pendingManifestPath, "utf8");

    const inspected = await inspectWorkspaceGeneration(dir, "ws-1");
    const opened = await openDurableWorkspace(dir, "ws-1").catch((error: unknown) => error);

    assert.equal(inspected.classification, "recovery_required");
    assert.equal(opened instanceof WorkspaceGenerationError, true);
    assert.equal(await readFile(pointerPath, "utf8"), beforePointer);
    assert.equal(await readFile(pendingManifestPath, "utf8"), beforeManifest);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test("prepared leftovers are ignored by reads and pruned by locked recovery", async () => {
  const dir = await mkdtemp(join(tmpdir(), "ucf-yjs-generation-prepared-prune-"));
  try {
    const previous = processorWithDocument("ws-1", "Alpha");
    await publishWorkspaceGeneration({ root: dir, workspace_id: "ws-1", ...previous });
    const intended = processorWithDocument("ws-1", "Beta");
    await assert.rejects(
      publishWorkspaceGeneration({ root: dir, workspace_id: "ws-1", ...intended, fault_injection: { fail_after_phase: "prepared" } }),
      WorkspaceGenerationError
    );
    const before = generationDirectoryCount(dir, "ws-1");
    const inspected = await inspectWorkspaceGeneration(dir, "ws-1");
    const opened = await openDurableWorkspace(dir, "ws-1");
    assert.equal(inspected.classification, "clean");
    assert.equal(opened?.ydoc.getText("doc-1").toString(), "Alpha");
    assert.equal(generationDirectoryCount(dir, "ws-1"), before);

    const resolved = await resolveWorkspaceRecovery(dir, "ws-1");
    assert.equal(resolved.classification, "clean");
    assert.equal(resolved.diagnostics.some((item) => item.reason === "prepared_generations_pruned"), true);
    assert.equal(generationDirectoryCount(dir, "ws-1"), before - 1);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test("recovery rejects missing parents and self-cycles", async () => {
  for (const previous_generation_id of ["sha256:" + "1".repeat(64), "self"] as const) {
    const dir = await mkdtemp(join(tmpdir(), "ucf-yjs-generation-lineage-"));
    try {
      const previous = processorWithDocument("ws-1", "Alpha");
      const previousManifest = await publishWorkspaceGeneration({ root: dir, workspace_id: "ws-1", ...previous });
      const intended = processorWithDocument("ws-1", "Beta");
      await assert.rejects(
        publishWorkspaceGeneration({ root: dir, workspace_id: "ws-1", ...intended, fault_injection: { fail_after_phase: "published" } }),
        WorkspaceGenerationError
      );
      const pendingId = newestGenerationId(dir, "ws-1", previousManifest.generation_id);
      const pendingPath = generationPath(dir, "ws-1", pendingId);
      const manifest = JSON.parse(await readFile(join(pendingPath, "manifest.json"), "utf8")) as WorkspaceGenerationManifest;
      const changedPrevious = previous_generation_id === "self" ? manifest.generation_id : previous_generation_id;
      await writeManifestAndPointer(dir, "ws-1", withPhaseIntegrity({ ...manifest, previous_generation_id: changedPrevious }));

      const inspected = await inspectWorkspaceGeneration(dir, "ws-1");
      assert.equal(inspected.classification, "divergence");
      assert.equal(inspected.diagnostics[0]?.reason, "pending_generation_parent_missing_or_uncommitted");
      await assert.rejects(openDurableWorkspace(dir, "ws-1"), WorkspaceGenerationError);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  }
});

test("raw provider import is retained as unclassified state until reconciled", async () => {
  const dir = await mkdtemp(join(tmpdir(), "ucf-yjs-generation-import-"));
  try {
    const rawDoc = new Y.Doc();
    rawDoc.getText("doc-raw").insert(0, "Raw provider text");
    const rawBytes = Y.encodeStateAsUpdate(rawDoc);

    const fresh = await importProviderState(dir, "ws-import", rawBytes);
    assert.equal(fresh.ok, false);
    assert.equal(fresh.classification, "unclassified_provider_state");
    assert.equal((await openDurableWorkspace(dir, "ws-import")), null);
    assert.equal(importRetained(dir, "ws-import", fresh.import_id), true);
    await assert.rejects(
      submitDurableCommand({
        root: dir,
        workspace_id: "ws-import",
        command: command("ws-import", "cmd-checkpoint-raw-import", "checkpoint.create", { kind: "workspace" }, {}),
        capability
      }),
      WorkspaceGenerationError
    );

    const state = processorWithDocument("ws-1", "Alpha");
    const manifest = await publishWorkspaceGeneration({ root: dir, workspace_id: "ws-1", ...state });
    const exported = await exportProviderState(dir, "ws-1");
    const identical = await importProviderState(dir, "ws-1", exported);
    assert.equal(identical.ok, true);
    assert.equal(identical.classification, "identical_existing");
    assert.equal(identical.generation_id, manifest.generation_id);
    const checkpointAfterIdentical = await submitDurableCommand({
      root: dir,
      workspace_id: "ws-1",
      command: command("ws-1", "cmd-checkpoint-after-identical-import", "checkpoint.create", { kind: "workspace" }, {}),
      capability
    });
    assert.equal(checkpointAfterIdentical.generation_published, true);
    const activeGenerationAfterIdentical = checkpointAfterIdentical.generation_id;

    const changedDoc = new Y.Doc();
    changedDoc.getText("doc-1").insert(0, "Beta");
    const changed = await importProviderState(dir, "ws-1", Y.encodeStateAsUpdate(changedDoc));
    const repeated = await importProviderState(dir, "ws-1", Y.encodeStateAsUpdate(changedDoc));
    const reopened = await openDurableWorkspace(dir, "ws-1");
    assert.equal(changed.ok, false);
    assert.equal(changed.classification, "unclassified_provider_state");
    assert.equal(repeated.ok, false);
    assert.equal(repeated.import_id, changed.import_id);
    assert.equal(reopened?.generation.generation_id, activeGenerationAfterIdentical);
    assert.equal(reopened?.ydoc.getText("doc-1").toString(), "Alpha");
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test("historical generations remain readable when current registry has compatible extra entries", async () => {
  const dir = await mkdtemp(join(tmpdir(), "ucf-yjs-generation-schema-compat-"));
  try {
    const state = processorWithDocument("ws-1", "Alpha");
    const manifest = await publishWorkspaceGeneration({ root: dir, workspace_id: "ws-1", ...state });
    const path = generationPath(dir, "ws-1", manifest.generation_id);
    const schemaPath = join(path, "components", "schemas.json");
    const references = JSON.parse(await readFile(schemaPath, "utf8")) as {
      readonly entries: readonly { readonly artifact: string; readonly version: string }[];
    };
    const historicalReferences = {
      ...references,
      entries: references.entries.filter((entry) => entry.artifact !== "observation_log_schema")
    };
    const bytes = Buffer.from(canonicalJson(historicalReferences as unknown as JsonObject), "utf8");
    await writeFile(schemaPath, bytes);
    const changed = withPhaseIntegrity({
      ...manifest,
      components: manifest.components.map((component) =>
        component.name === "schema_profile_references"
          ? { ...component, digest: componentDigest(component.name, bytes), byte_length: bytes.byteLength }
          : component
      )
    });
    await writeManifestAndPointer(dir, "ws-1", changed);

    const reopened = await openDurableWorkspace(dir, "ws-1");
    assert.equal(reopened?.generation.generation_id, manifest.generation_id);
    assert.equal(reopened?.ydoc.getText("doc-1").toString(), "Alpha");
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test("phase metadata is integrity checked and created_at remains non-authoritative", async () => {
  const dir = await mkdtemp(join(tmpdir(), "ucf-yjs-generation-phase-"));
  try {
    const state = processorWithDocument("ws-1", "Alpha");
    const manifest = await publishWorkspaceGeneration({ root: dir, workspace_id: "ws-1", ...state });
    const manifestPath = join(generationPath(dir, "ws-1", manifest.generation_id), "manifest.json");
    await writeFile(manifestPath, canonicalJson({ ...manifest, created_at: "2099-01-01T00:00:00.000Z" } as unknown as JsonObject), "utf8");
    assert.equal((await openDurableWorkspace(dir, "ws-1"))?.ydoc.getText("doc-1").toString(), "Alpha");

    const editedPhase = withPhaseIntegrity({ ...manifest, phase: "prepared", phase_history: ["prepared"] });
    await writeFile(manifestPath, canonicalJson(editedPhase as unknown as JsonObject), "utf8");
    const inspected = await inspectWorkspaceGeneration(dir, "ws-1");
    assert.equal(inspected.classification, "divergence");
    assert.equal(inspected.diagnostics[0]?.reason, "current_pointer_manifest_digest_mismatch");
    await assert.rejects(openDurableWorkspace(dir, "ws-1"), WorkspaceGenerationError);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }

  for (const phase_history of [["prepared", "material_written", "material_written"], ["prepared", "validated"]] as const) {
    const invalidDir = await mkdtemp(join(tmpdir(), "ucf-yjs-generation-phase-invalid-"));
    try {
      const state = processorWithDocument("ws-1", "Alpha");
      const manifest = await publishWorkspaceGeneration({ root: invalidDir, workspace_id: "ws-1", ...state });
      const changed = withPhaseIntegrity({ ...manifest, phase: phase_history.at(-1)!, phase_history });
      await writeManifestAndPointer(invalidDir, "ws-1", changed);
      const validation = await validateDurableWorkspace(invalidDir, "ws-1");
      assert.equal(validation.ok, false);
      if (!validation.ok) {
        assert.equal(validation.code, "UCFY_CORRUPT_GENERATION");
      }
    } finally {
      await rm(invalidDir, { recursive: true, force: true });
    }
  }
});

test("current pointer digest mismatch is typed divergence", async () => {
  const dir = await mkdtemp(join(tmpdir(), "ucf-yjs-generation-pointer-"));
  try {
    const state = processorWithDocument("ws-1", "Alpha");
    await publishWorkspaceGeneration({ root: dir, workspace_id: "ws-1", ...state });
    const pointerPath = join(workspaceStorePath(dir, "ws-1"), "current.json");
    const pointer = JSON.parse(await readFile(pointerPath, "utf8")) as Record<string, unknown>;
    await writeFile(pointerPath, JSON.stringify({ ...pointer, manifest_digest: "sha256:" + "0".repeat(64) }), "utf8");

    const recovery = await recoverWorkspaceGeneration(dir, "ws-1");
    await assert.rejects(openDurableWorkspace(dir, "ws-1"), WorkspaceGenerationError);
    assert.equal(recovery.classification, "divergence");
    assert.equal(recovery.diagnostics[0]?.reason, "current_pointer_manifest_digest_mismatch");
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

function processorWithDocument(workspace_id: string, text: string): { readonly processor: WorkspaceProcessor; readonly ydoc: Y.Doc } {
  const ydoc = new Y.Doc();
  const processor = new WorkspaceProcessor(workspace_id, "ucf-yjs.reducer.v1", { ydoc });
  processor.submit(command(workspace_id, `cmd-doc-${text}`, "document.create", { kind: "document", document_id: "doc-1" }, { document_id: "doc-1", text }), capability);
  return { processor, ydoc };
}

function command(workspace_id: string, command_id: string, operation: string, target: JsonObject & { readonly kind: string }, payload: JsonObject) {
  return createCommand({
    command_id,
    idempotency_key: `idem-${command_id}`,
    actor: { actor_id: "runtime-test", kind: "agent" },
    workspace_id,
    operation,
    target,
    payload
  });
}

function newestGenerationId(root: string, workspace_id: string, excluding: string): string {
  const workspacePath = workspaceStorePath(root, workspace_id);
  const generations = readdirSync(join(workspacePath, "generations"));
  const ids = generations
    .map((item) => {
      const manifestPath = join(workspacePath, "generations", item, "manifest.json");
      return JSON.parse(readFileSync(manifestPath, "utf8")) as { readonly generation_id: string };
    })
    .map((item) => item.generation_id)
    .filter((item) => item !== excluding);
  const found = ids.sort().at(-1);
  assert.notEqual(found, undefined);
  return found!;
}

function generationPath(root: string, workspace_id: string, generation_id: string): string {
  const workspacePath = workspaceStorePath(root, workspace_id);
  const found = readdirSync(join(workspacePath, "generations"))
    .map((entry) => join(workspacePath, "generations", entry))
    .find((candidate) => {
      const manifest = JSON.parse(readFileSync(join(candidate, "manifest.json"), "utf8")) as { readonly generation_id: string };
      return manifest.generation_id === generation_id;
    });
  assert.notEqual(found, undefined);
  return found!;
}

function generationDirectoryCount(root: string, workspace_id: string): number {
  return readdirSync(join(workspaceStorePath(root, workspace_id), "generations")).length;
}

function importRetained(root: string, workspace_id: string, import_id: string): boolean {
  return existsSync(join(workspaceStorePath(root, workspace_id), "imports", pathSegmentForHash(import_id), "provider.bin"));
}

function pathSegmentForHash(value: string): string {
  return `gen_${Buffer.from(value, "utf8").toString("base64url")}`;
}

async function writeManifestAndPointer(root: string, workspace_id: string, manifest: WorkspaceGenerationManifest): Promise<void> {
  const manifestPath = join(generationPath(root, workspace_id, manifest.generation_id), "manifest.json");
  await writeFile(manifestPath, canonicalJson(manifest as unknown as JsonObject), "utf8");
  const pointerPath = join(workspaceStorePath(root, workspace_id), "current.json");
  const pointer = JSON.parse(await readFile(pointerPath, "utf8")) as CurrentPointer;
  await writeFile(pointerPath, canonicalJson({ ...pointer, manifest_digest: manifestDigest(manifest) } as unknown as JsonObject), "utf8");
}

function withPhaseIntegrity(manifest: WorkspaceGenerationManifest): WorkspaceGenerationManifest {
  const { phase_integrity_digest: _phaseIntegrityDigest, ...withoutDigest } = manifest;
  return {
    ...withoutDigest,
    phase_integrity_digest: domainHash("ucf-yjs.workspace_generation.phase_integrity.v1", {
      schema_version: withoutDigest.schema_version,
      workspace_id: withoutDigest.workspace_id,
      generation_id: withoutDigest.generation_id,
      previous_generation_id: withoutDigest.previous_generation_id,
      phase: withoutDigest.phase,
      phase_history: withoutDigest.phase_history,
      reducer_version: withoutDigest.reducer_version,
      components: withoutDigest.components
    } as unknown as JsonObject)
  };
}

function manifestDigest(manifest: WorkspaceGenerationManifest): string {
  return domainHash("ucf-yjs.workspace_generation.manifest.v1", {
    schema_version: manifest.schema_version,
    workspace_id: manifest.workspace_id,
    generation_id: manifest.generation_id,
    previous_generation_id: manifest.previous_generation_id,
    phase_integrity_digest: manifest.phase_integrity_digest,
    reducer_version: manifest.reducer_version,
    components: manifest.components
  } as unknown as JsonObject);
}

function componentDigest(name: string, bytes: Uint8Array): string {
  return domainHash("ucf-yjs.workspace_generation.component.v1", {
    name,
    bytes_base64: Buffer.from(bytes).toString("base64")
  });
}
