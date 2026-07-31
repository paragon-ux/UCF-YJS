import { spawnSync } from "node:child_process";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import test from "node:test";
import assert from "node:assert/strict";

import * as Y from "yjs";

import { WorkspaceProcessor, createCommand } from "../../packages/command-processor/src/index.js";
import {
  WorkspaceLockError,
  acquireWorkspaceLock,
  openDurableWorkspace,
  publishWorkspaceGeneration
} from "../../packages/runtime/src/index.js";
import type { CapabilityContext } from "../../packages/projections/src/index.js";

const capability: CapabilityContext = { actor_id: "lock-test", can_read_content: true, can_write: true, can_accept: true };

test("workspace writer lock excludes competing immediate writers", async () => {
  const dir = await mkdtemp(join(tmpdir(), "ucf-yjs-lock-"));
  try {
    const lock = await acquireWorkspaceLock(dir, "ws-lock");
    await assert.rejects(acquireWorkspaceLock(dir, "ws-lock"), (error: unknown) => {
      assert.equal(error instanceof WorkspaceLockError, true);
      assert.equal((error as WorkspaceLockError).code, "UCFY_LOCK_BUSY");
      return true;
    });
    await lock.release();
    const next = await acquireWorkspaceLock(dir, "ws-lock");
    await next.release();
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test("workspace writer lock supports bounded wait failure", async () => {
  const dir = await mkdtemp(join(tmpdir(), "ucf-yjs-lock-wait-"));
  try {
    const lock = await acquireWorkspaceLock(dir, "ws-lock");
    const started = Date.now();
    await assert.rejects(acquireWorkspaceLock(dir, "ws-lock", { wait_ms: 100 }), WorkspaceLockError);
    assert.equal(Date.now() - started >= 50, true);
    await lock.release();
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test("process exit releases workspace writer lock", async () => {
  const dir = await mkdtemp(join(tmpdir(), "ucf-yjs-lock-crash-"));
  try {
    const runtimeUrl = pathToFileURL(join(process.cwd(), "dist", "packages", "runtime", "src", "index.js")).href;
    const code = `
      const { acquireWorkspaceLock } = await import(${JSON.stringify(runtimeUrl)});
      await acquireWorkspaceLock(${JSON.stringify(dir)}, "ws-lock");
      console.log("locked");
      process.exit(97);
    `;
    const result = spawnSync(process.execPath, ["--input-type=module", "-e", code], { encoding: "utf8" });
    assert.equal(result.status, 97);
    assert.equal(result.stdout.includes("locked"), true);
    const lock = await acquireWorkspaceLock(dir, "ws-lock", { wait_ms: 1000 });
    await lock.release();
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test("committed-generation reads remain available while writer lock is held", async () => {
  const dir = await mkdtemp(join(tmpdir(), "ucf-yjs-lock-read-"));
  try {
    const ydocProcessor = processorWithDocument("ws-lock", "Alpha");
    await publishWorkspaceGeneration({ root: dir, workspace_id: "ws-lock", ...ydocProcessor });
    const lock = await acquireWorkspaceLock(dir, "ws-lock");
    try {
      const reopened = await openDurableWorkspace(dir, "ws-lock");
      assert.equal(reopened?.ydoc.getText("doc-1").toString(), "Alpha");
    } finally {
      await lock.release();
    }
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

function processorWithDocument(workspace_id: string, text: string) {
  const ydoc = new Y.Doc();
  const processor = new WorkspaceProcessor(workspace_id, "ucf-yjs.reducer.v1", { ydoc });
  processor.submit(
    createCommand({
      command_id: "cmd-doc",
      idempotency_key: "idem-cmd-doc",
      actor: { actor_id: "lock-test", kind: "agent" },
      workspace_id,
      operation: "document.create",
      target: { kind: "document", document_id: "doc-1" },
      payload: { document_id: "doc-1", text }
    }),
    capability
  );
  return { processor, ydoc };
}
