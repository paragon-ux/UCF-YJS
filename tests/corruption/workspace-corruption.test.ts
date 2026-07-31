import { readFileSync } from "node:fs";
import { readFile, writeFile, mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import assert from "node:assert/strict";

import * as Y from "yjs";

import { WorkspaceProcessor, createCommand } from "../../packages/command-processor/src/index.js";
import { canonicalJson, domainHash, type JsonObject } from "../../packages/protocol/src/index.js";
import {
  WorkspaceGenerationError,
  publishWorkspaceGeneration,
  recoverWorkspaceGeneration,
  validateDurableWorkspace,
  workspaceStorePath,
  type WorkspaceGenerationManifest,
  type CurrentPointer,
  type GenerationComponentName
} from "../../packages/runtime/src/index.js";
import type { WorkspaceProcessorSnapshot } from "../../packages/command-processor/src/index.js";
import type { CapabilityContext } from "../../packages/projections/src/index.js";
import type { SemanticLogRecord } from "../../packages/semantic-log/src/index.js";

const capability: CapabilityContext = { actor_id: "corruption-test", can_read_content: true, can_write: true, can_accept: true };

type CorruptionFixture = {
  readonly id: string;
  readonly expected_code: "UCFY_CORRUPT_GENERATION" | "UCFY_DIVERGENCE" | "UCFY_REJECTED_UNSUPPORTED_SCHEMA";
  mutate(context: FixtureContext): Promise<void>;
};

type FixtureContext = {
  readonly root: string;
  readonly workspace_id: string;
  readonly generation_id: string;
};

const fixtures: readonly CorruptionFixture[] = [
  {
    id: "malformed-generation-manifest",
    expected_code: "UCFY_CORRUPT_GENERATION",
    mutate: async (context) => {
      await writeFile(manifestPath(context), "{", "utf8");
    }
  },
  {
    id: "component-digest-mismatch",
    expected_code: "UCFY_DIVERGENCE",
    mutate: async (context) => {
      await writeFile(componentPath(context, "semantic_log"), "[]", "utf8");
    }
  },
  {
    id: "truncated-semantic-log",
    expected_code: "UCFY_CORRUPT_GENERATION",
    mutate: async (context) => {
      await rewriteComponent(context, "semantic_log", Buffer.from("[", "utf8"));
    }
  },
  {
    id: "command-without-outcome",
    expected_code: "UCFY_CORRUPT_GENERATION",
    mutate: async (context) => {
      const log = await semanticLog(context);
      await rewriteComponent(context, "semantic_log", jsonBytes(log.filter((record) => record.record_type !== "outcome")));
    }
  },
  {
    id: "bad-idempotency-reference",
    expected_code: "UCFY_CORRUPT_GENERATION",
    mutate: async (context) => {
      const log = await semanticLog(context);
      const changed = log.map((record) =>
        record.record_type === "idempotency"
          ? { ...record, original_command_id: "missing-command", original_payload_digest: "sha256:" + "0".repeat(64) }
          : record
      );
      await rewriteComponent(context, "semantic_log", jsonBytes(changed));
    }
  },
  {
    id: "mismatched-checkpoint-document",
    expected_code: "UCFY_CORRUPT_GENERATION",
    mutate: async (context) => {
      const snapshot = await processorSnapshot(context);
      const changed = {
        ...snapshot,
        checkpoint_documents: snapshot.checkpoint_documents.map((entry) => ({
          ...entry,
          documents: entry.documents.map((document) => ({ ...document, text: `${document.text}!` }))
        }))
      };
      await rewriteSnapshotComponents(context, changed);
    }
  },
  {
    id: "missing-checkpoint-document",
    expected_code: "UCFY_CORRUPT_GENERATION",
    mutate: async (context) => {
      const snapshot = await processorSnapshot(context);
      await rewriteSnapshotComponents(context, { ...snapshot, checkpoint_documents: [] });
    }
  },
  {
    id: "extra-checkpoint-document",
    expected_code: "UCFY_CORRUPT_GENERATION",
    mutate: async (context) => {
      const snapshot = await processorSnapshot(context);
      const [entry] = snapshot.checkpoint_documents;
      assert.notEqual(entry, undefined);
      const changed = {
        ...snapshot,
        checkpoint_documents: [
          ...snapshot.checkpoint_documents,
          { checkpoint_id: entry!.checkpoint_id, documents: [{ document_id: "extra", text: "Extra" }] }
        ]
      };
      await rewriteSnapshotComponents(context, changed);
    }
  },
  {
    id: "duplicate-checkpoint-document",
    expected_code: "UCFY_CORRUPT_GENERATION",
    mutate: async (context) => {
      const snapshot = await processorSnapshot(context);
      const changed = {
        ...snapshot,
        checkpoint_documents: snapshot.checkpoint_documents.map((entry) => ({
          ...entry,
          documents: [...entry.documents, entry.documents[0]!]
        }))
      };
      await rewriteSnapshotComponents(context, changed);
    }
  },
  {
    id: "stale-reducer-snapshot",
    expected_code: "UCFY_CORRUPT_GENERATION",
    mutate: async (context) => {
      const snapshot = await processorSnapshot(context);
      await rewriteSnapshotComponents(context, { ...snapshot, reducer_version: "ucf-yjs.reducer.stale" });
    }
  },
  {
    id: "undecodable-anchor",
    expected_code: "UCFY_CORRUPT_GENERATION",
    mutate: async (context) => {
      const snapshot = await processorSnapshot(context);
      const changed = { ...snapshot, anchors: snapshot.anchors.map((anchor) => ({ ...anchor, start: [255, 255, 255] })) };
      await rewriteSnapshotComponents(context, changed);
    }
  },
  {
    id: "unsupported-schema-version",
    expected_code: "UCFY_REJECTED_UNSUPPORTED_SCHEMA",
    mutate: async (context) => {
      const manifest = await readManifest(context);
      await writeManifestAndPointer(context, { ...manifest, schema_version: "ucf-yjs.workspace_generation.v999" as "ucf-yjs.workspace_generation.v1" });
    }
  },
  {
    id: "provider-document-set-mismatch",
    expected_code: "UCFY_CORRUPT_GENERATION",
    mutate: async (context) => {
      await rewriteComponent(context, "provider_state", Y.encodeStateAsUpdate(new Y.Doc()));
    }
  }
];

test("valid workspace generation validates before corruption", async () => {
  const context = await createFixtureWorkspace();
  try {
    assert.deepEqual(await validateDurableWorkspace(context.root, context.workspace_id), {
      ok: true,
      workspace_id: context.workspace_id,
      generation_id: context.generation_id
    });
  } finally {
    await rm(context.root, { recursive: true, force: true });
  }
});

test("validation does not recover or publish pending generations", async () => {
  const root = await mkdtemp(join(tmpdir(), "ucf-yjs-corruption-pending-"));
  const workspace_id = "ws-corrupt";
  try {
    const first = workspaceState(workspace_id, "Alpha");
    const previous = await publishWorkspaceGeneration({ root, workspace_id, ...first });
    const second = workspaceState(workspace_id, "Beta");
    await assert.rejects(
      publishWorkspaceGeneration({ root, workspace_id, ...second, fault_injection: { fail_after_phase: "material_written" } }),
      WorkspaceGenerationError
    );
    assert.deepEqual(await validateDurableWorkspace(root, workspace_id), {
      ok: true,
      workspace_id,
      generation_id: previous.generation_id
    });
    const recovered = await recoverWorkspaceGeneration(root, workspace_id);
    assert.equal(recovered.classification, "recovered");
    assert.notEqual(recovered.recovered_generation_id, previous.generation_id);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

for (const fixture of fixtures) {
  test(`corruption fixture fails closed: ${fixture.id}`, async () => {
    const context = await createFixtureWorkspace();
    try {
      await fixture.mutate(context);
      const result = await validateDurableWorkspace(context.root, context.workspace_id);
      assert.equal(result.ok, false);
      if (!result.ok) {
        assert.equal(result.code, fixture.expected_code);
        assert.equal(JSON.stringify(result.diagnostics).includes(context.root), false);
      }
    } finally {
      await rm(context.root, { recursive: true, force: true });
    }
  });
}

async function createFixtureWorkspace(): Promise<FixtureContext> {
  const root = await mkdtemp(join(tmpdir(), "ucf-yjs-corruption-"));
  const workspace_id = "ws-corrupt";
  const state = workspaceState(workspace_id, "Alpha beta");
  const generation = await publishWorkspaceGeneration({ root, workspace_id, ...state });
  return { root, workspace_id, generation_id: generation.generation_id };
}

function workspaceState(workspace_id: string, text: string): { readonly processor: WorkspaceProcessor; readonly ydoc: Y.Doc } {
  const ydoc = new Y.Doc();
  const processor = new WorkspaceProcessor(workspace_id, "ucf-yjs.reducer.v1", { ydoc });
  processor.submit(command(workspace_id, "cmd-doc", "document.create", { kind: "document", document_id: "doc-1" }, { document_id: "doc-1", text }), capability);
  processor.submit(command(workspace_id, "cmd-cite", "citation.activate", { kind: "document", document_id: "doc-1" }, { citation_id: "c1", start: 0, end: 5, expected_text: "Alpha" }), capability);
  processor.submit(command(workspace_id, "cmd-dupe", "status.get", { kind: "workspace" }, {}), capability);
  processor.submit(command(workspace_id, "cmd-checkpoint", "checkpoint.create", { kind: "workspace" }, {}), capability);
  return { processor, ydoc };
}

function command(workspace_id: string, command_id: string, operation: string, target: JsonObject & { readonly kind: string }, payload: JsonObject) {
  return createCommand({
    command_id,
    idempotency_key: `idem-${command_id}`,
    actor: { actor_id: "corruption-test", kind: "agent" },
    workspace_id,
    operation,
    target,
    payload
  });
}

async function semanticLog(context: FixtureContext): Promise<readonly SemanticLogRecord[]> {
  return readJson(componentPath(context, "semantic_log")) as Promise<readonly SemanticLogRecord[]>;
}

async function processorSnapshot(context: FixtureContext): Promise<WorkspaceProcessorSnapshot> {
  return readJson(componentPath(context, "processor_metadata")) as Promise<WorkspaceProcessorSnapshot>;
}

async function rewriteSnapshotComponents(context: FixtureContext, snapshot: WorkspaceProcessorSnapshot): Promise<void> {
  await rewriteComponent(context, "processor_metadata", jsonBytes(snapshot));
  await rewriteComponent(context, "citation_state", jsonBytes(snapshot.citations));
  await rewriteComponent(context, "relative_anchors", jsonBytes(snapshot.anchors));
  await rewriteComponent(context, "semantic_log", jsonBytes(snapshot.semantic_log));
  await rewriteComponent(context, "idempotency_state", jsonBytes(snapshot.semantic_log.filter((record) => record.record_type === "idempotency")));
  await rewriteComponent(context, "checkpoint_manifests", jsonBytes(snapshot.checkpoints));
  await rewriteComponent(context, "retained_checkpoint_documents", jsonBytes(snapshot.checkpoint_documents));
}

async function rewriteComponent(context: FixtureContext, component: GenerationComponentName, bytes: Uint8Array): Promise<void> {
  await writeFile(componentPath(context, component), bytes);
  const manifest = await readManifest(context);
  const components = manifest.components.map((descriptor) =>
    descriptor.name === component
      ? { ...descriptor, digest: componentDigest(component, bytes), byte_length: bytes.byteLength }
      : descriptor
  );
  await writeManifestAndPointer(context, { ...manifest, components });
}

async function writeManifestAndPointer(context: FixtureContext, manifest: WorkspaceGenerationManifest): Promise<void> {
  await writeFile(manifestPath(context), canonicalJson(manifest as unknown as JsonObject), "utf8");
  const pointerPath = join(workspaceStorePath(context.root, context.workspace_id), "current.json");
  const pointer = JSON.parse(await readFile(pointerPath, "utf8")) as CurrentPointer;
  const updatedPointer: CurrentPointer = { ...pointer, manifest_digest: manifestDigest(manifest) };
  await writeFile(pointerPath, canonicalJson(updatedPointer as unknown as JsonObject), "utf8");
}

async function readManifest(context: FixtureContext): Promise<WorkspaceGenerationManifest> {
  return readJson(manifestPath(context)) as Promise<WorkspaceGenerationManifest>;
}

function componentPath(context: FixtureContext, component: GenerationComponentName): string {
  const manifest = readManifestSync(context);
  const descriptor = manifest.components.find((item) => item.name === component);
  assert.notEqual(descriptor, undefined);
  return join(generationPath(context), descriptor!.path);
}

function manifestPath(context: FixtureContext): string {
  return join(generationPath(context), "manifest.json");
}

function generationPath(context: FixtureContext): string {
  return join(workspaceStorePath(context.root, context.workspace_id), "generations", encodeURIComponent(context.generation_id));
}

function readManifestSync(context: FixtureContext): WorkspaceGenerationManifest {
  return JSON.parse(readFileSync(manifestPath(context), "utf8")) as WorkspaceGenerationManifest;
}

function componentDigest(name: GenerationComponentName, bytes: Uint8Array): string {
  return domainHash("ucf-yjs.workspace_generation.component.v1", {
    name,
    bytes_base64: Buffer.from(bytes).toString("base64")
  });
}

function manifestDigest(manifest: WorkspaceGenerationManifest): string {
  return domainHash("ucf-yjs.workspace_generation.manifest.v1", {
    schema_version: manifest.schema_version,
    workspace_id: manifest.workspace_id,
    generation_id: manifest.generation_id,
    previous_generation_id: manifest.previous_generation_id,
    reducer_version: manifest.reducer_version,
    components: manifest.components
  } as unknown as JsonObject);
}

function jsonBytes(value: unknown): Uint8Array {
  return Buffer.from(canonicalJson(value as JsonObject), "utf8");
}

async function readJson(path: string): Promise<unknown> {
  return JSON.parse(await readFile(path, "utf8")) as unknown;
}
