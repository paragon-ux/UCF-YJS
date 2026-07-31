import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import assert from "node:assert/strict";

import * as Y from "yjs";

import {
  acquireWorkspaceLock,
  importProviderState,
  inspectUnclassifiedProviderImport,
  listUnclassifiedProviderImports,
  workspaceStorePath
} from "../../packages/runtime/src/index.js";
import { domainHash } from "../../packages/protocol/src/index.js";

const WORKSPACE_ID = "ws-provider-locking";

test("provider intake list and inspect wait for locked publication", async () => {
  const root = await mkdtemp(join(tmpdir(), "ucf-yjs-provider-list-lock-"));
  const bytes = providerState("Alpha");
  const importId = providerImportId(bytes);
  const intakePath = providerImportDirectory(root, WORKSPACE_ID, importId);
  const lock = await acquireWorkspaceLock(root, WORKSPACE_ID);
  try {
    let listSettled = false;
    let inspectSettled = false;
    const listing = listUnclassifiedProviderImports(root, WORKSPACE_ID);
    const inspection = inspectUnclassifiedProviderImport(root, WORKSPACE_ID, importId);
    void listing.then(() => { listSettled = true; }, () => { listSettled = true; });
    void inspection.then(() => { inspectSettled = true; }, () => { inspectSettled = true; });

    await delay(75);
    assert.equal(listSettled, false);
    assert.equal(inspectSettled, false);

    await mkdir(intakePath, { recursive: true });
    await writeFile(join(intakePath, "provider.bin"), bytes);
    await lock.release();

    const [listed, inspected] = await Promise.all([listing, inspection]);
    assert.deepEqual(listed.map((item) => item.import_id), [importId]);
    assert.equal(inspected.ok, true);
    assert.equal(inspected.ok ? inspected.inspection.import_id : "", importId);
  } finally {
    await lock.release();
    await rm(root, { recursive: true, force: true });
  }
});

test("provider intake list and inspect treat a locked concurrent discard as absent", async () => {
  const root = await mkdtemp(join(tmpdir(), "ucf-yjs-provider-discard-lock-"));
  const bytes = providerState("Beta");
  const retained = await importProviderState(root, WORKSPACE_ID, bytes);
  assert.equal(retained.ok, false);
  const importId = retained.import_id;
  const lock = await acquireWorkspaceLock(root, WORKSPACE_ID);
  try {
    let listSettled = false;
    const listing = listUnclassifiedProviderImports(root, WORKSPACE_ID);
    const inspection = inspectUnclassifiedProviderImport(root, WORKSPACE_ID, importId);
    void listing.then(() => { listSettled = true; }, () => { listSettled = true; });

    await delay(75);
    assert.equal(listSettled, false);

    await rm(providerImportDirectory(root, WORKSPACE_ID, importId), { recursive: true, force: true });
    await lock.release();

    const [listed, inspected] = await Promise.all([listing, inspection]);
    assert.deepEqual(listed, []);
    assert.equal(inspected.ok, false);
    assert.equal(inspected.classification, "not_found");
  } finally {
    await lock.release();
    await rm(root, { recursive: true, force: true });
  }
});

function providerState(text: string): Uint8Array {
  const ydoc = new Y.Doc();
  ydoc.getText("doc-1").insert(0, text);
  return Y.encodeStateAsUpdate(ydoc);
}

function providerImportId(bytes: Uint8Array): string {
  return domainHash("ucf-yjs.provider_import.v1", { bytes_base64: Buffer.from(bytes).toString("base64") });
}

function providerImportDirectory(root: string, workspaceId: string, importId: string): string {
  const segment = `gen_${Buffer.from(importId, "utf8").toString("base64url")}`;
  return join(workspaceStorePath(root, workspaceId), "imports", segment);
}

async function delay(milliseconds: number): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, milliseconds));
}
