import { readdirSync } from "node:fs";
import { readFile, writeFile, mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import assert from "node:assert/strict";

import * as Y from "yjs";

import { WorkspaceProcessor, createCommand } from "../../packages/command-processor/src/index.js";
import {
  WorkspaceGenerationError,
  openDurableWorkspace,
  publishWorkspaceGeneration,
  recoverWorkspaceGeneration,
  workspaceStorePath
} from "../../packages/runtime/src/index.js";
import type { JsonObject } from "../../packages/protocol/src/index.js";
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
      const recovery = await recoverWorkspaceGeneration(dir, "ws-1");
      const active = await openDurableWorkspace(dir, "ws-1");
      assert.notEqual(active, null);
      if (phase === "prepared") {
        assert.equal(recovery.active_generation_id, previousManifest.generation_id);
        assert.equal(active?.ydoc.getText("doc-1").toString(), "Alpha");
      } else {
        assert.equal(recovery.classification, phase === "committed" ? "clean" : "recovered");
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
    const first = await recoverWorkspaceGeneration(dir, "ws-1");
    const reopened = await openDurableWorkspace(dir, "ws-1");
    const semanticCount = reopened?.processor.semanticLog.snapshot().length;
    const second = await recoverWorkspaceGeneration(dir, "ws-1");
    const reopenedAgain = await openDurableWorkspace(dir, "ws-1");
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
    const pendingManifest = JSON.parse(
      await readFile(join(workspaceStorePath(dir, "ws-1"), "generations", encodeURIComponent(pendingId), "manifest.json"), "utf8")
    ) as { readonly generation_id: string };
    const componentPath = join(workspaceStorePath(dir, "ws-1"), "generations", encodeURIComponent(pendingManifest.generation_id), "components", "semantic-log.json");
    await writeFile(componentPath, "[]", "utf8");

    const recovery = await recoverWorkspaceGeneration(dir, "ws-1");
    const active = await openDurableWorkspace(dir, "ws-1").catch((error: unknown) => error);
    assert.equal(recovery.classification, "divergence");
    assert.equal(recovery.active_generation_id, previousManifest.generation_id);
    assert.equal(active instanceof WorkspaceGenerationError, true);
  } finally {
    await rm(dir, { recursive: true, force: true });
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
    .map((item) => decodeURIComponent(item))
    .filter((item) => item !== excluding);
  const found = ids.sort().at(-1);
  assert.notEqual(found, undefined);
  return found!;
}
