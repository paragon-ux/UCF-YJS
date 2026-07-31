import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import assert from "node:assert/strict";

import * as Y from "yjs";

import { WorkspaceProcessor, createCommand } from "../../packages/command-processor/src/index.js";
import {
  WorkspaceGenerationError,
  inspectWorkspaceGeneration,
  openDurableWorkspace,
  publishWorkspaceGeneration,
  resolveWorkspaceRecovery
} from "../../packages/runtime/src/index.js";

const capability = { actor_id: "runtime-test", can_read_content: true, can_write: true, can_accept: true };

function processorWithDocument(workspace_id: string, text: string): { readonly processor: WorkspaceProcessor; readonly ydoc: Y.Doc } {
  const ydoc = new Y.Doc();
  const processor = new WorkspaceProcessor(workspace_id, "ucf-yjs.reducer.v1", { ydoc });
  processor.submit(
    createCommand({
      command_id: `cmd-${text}`,
      idempotency_key: `idem-${text}`,
      actor: { actor_id: "runtime-test", kind: "agent" },
      workspace_id,
      operation: "document.create",
      target: { kind: "document", document_id: "doc-1" },
      payload: { document_id: "doc-1", text }
    }),
    capability
  );
  return { processor, ydoc };
}

test("locked recovery completes manifest-before-pointer publication crashes", async () => {
  for (const phase of ["published", "committed"] as const) {
    const dir = await mkdtemp(join(tmpdir(), `ucf-yjs-pointer-lag-${phase}-`));
    try {
      await publishWorkspaceGeneration({ root: dir, workspace_id: "ws-1", ...processorWithDocument("ws-1", "Alpha") });
      await assert.rejects(
        publishWorkspaceGeneration({
          root: dir,
          workspace_id: "ws-1",
          ...processorWithDocument("ws-1", `Beta ${phase}`),
          fault_injection: { fail_after_manifest_phase: phase }
        }),
        WorkspaceGenerationError
      );

      const inspection = await inspectWorkspaceGeneration(dir, "ws-1");
      assert.equal(inspection.classification, "recovery_required");
      assert.equal(inspection.diagnostics[0]?.reason, "current_pointer_phase_lag");
      await assert.rejects(openDurableWorkspace(dir, "ws-1"), WorkspaceGenerationError);

      const resolved = await resolveWorkspaceRecovery(dir, "ws-1");
      assert.equal(resolved.classification, "recovered");
      const opened = await openDurableWorkspace(dir, "ws-1");
      assert.equal(opened?.ydoc.getText("doc-1").toString(), `Beta ${phase}`);

      const repeated = await resolveWorkspaceRecovery(dir, "ws-1");
      assert.equal(repeated.classification, "clean");
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  }
});
