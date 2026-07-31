import { spawnSync } from "node:child_process";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
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

test("lock helper startup failures are typed", async () => {
  const dir = await mkdtemp(join(tmpdir(), "ucf-yjs-lock-helper-"));
  try {
    await assert.rejects(acquireWorkspaceLock(dir, "ws-lock", { helper_command: join(dir, "missing-helper"), startup_timeout_ms: 100 }), (error: unknown) => {
      assert.equal(error instanceof WorkspaceLockError, true);
      assert.equal((error as WorkspaceLockError).code, "UCFY_LOCK_FAILED");
      return true;
    });

    const earlyExit = await helperScript(dir, "early-exit", "process.exit(9);\n");
    await assert.rejects(acquireWorkspaceLock(dir, "ws-lock", helperOptions(earlyExit)), (error: unknown) => {
      assert.equal(error instanceof WorkspaceLockError, true);
      assert.equal((error as WorkspaceLockError).code, "UCFY_LOCK_FAILED");
      return true;
    });

    const invalidReady = await helperScript(dir, "invalid-ready", "process.stdout.write('not-json\\n');\n");
    await assert.rejects(acquireWorkspaceLock(dir, "ws-lock", helperOptions(invalidReady)), (error: unknown) => {
      assert.equal(error instanceof WorkspaceLockError, true);
      assert.equal((error as WorkspaceLockError).code, "UCFY_LOCK_FAILED");
      return true;
    });

    const hanging = await hangingHelperScript(dir);
    await assert.rejects(acquireWorkspaceLock(dir, "ws-lock", { ...helperOptions(hanging), startup_timeout_ms: 100 }), (error: unknown) => {
      assert.equal(error instanceof WorkspaceLockError, true);
      assert.equal((error as WorkspaceLockError).code, "UCFY_LOCK_FAILED");
      return true;
    });
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test("lock release tolerates early helper exit and repeated release", async () => {
  const dir = await mkdtemp(join(tmpdir(), "ucf-yjs-lock-release-"));
  try {
    const helper = await helperScript(dir, "ready-then-exit", "process.stdout.write('{\"ok\":true}\\n');\n");
    const lock = await acquireWorkspaceLock(dir, "ws-lock", helperOptions(helper));
    await lock.release();
    await lock.release();
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

async function helperScript(dir: string, name: string, source: string): Promise<string> {
  const path = join(dir, `${name}.cjs`);
  await writeFile(path, source, "utf8");
  return path;
}

async function hangingHelperScript(dir: string): Promise<string> {
  return helperScript(dir, "hang", "setTimeout(() => undefined, 5000);\n");
}

function helperOptions(script: string) {
  return { helper_command: process.execPath, helper_args: [script], startup_timeout_ms: 1000 };
}
