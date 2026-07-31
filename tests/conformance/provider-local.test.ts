import { mkdtemp, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import test from "node:test";
import assert from "node:assert/strict";

import * as Y from "yjs";

import { LocalProvider } from "../../packages/provider-local/src/index.js";

test("local provider saves, reloads, compacts, and exports provider-neutral state", async () => {
  const dir = await mkdtemp(join(tmpdir(), "ucf-yjs-local-provider-"));
  try {
    const statePath = join(dir, "state.bin");
    const provider = await LocalProvider.open(statePath);
    const doc = provider.connect("left");
    doc.getText("body").insert(0, "persisted");
    provider.sync();
    await provider.save();

    const reloaded = await LocalProvider.open(statePath);
    const reloadedDoc = reloaded.connect("after-reload");
    assert.equal(reloadedDoc.getText("body").toString(), "persisted");

    reloadedDoc.getText("body").insert(9, " state");
    reloaded.sync();
    await reloaded.compact();
    const exported = reloaded.exportState();
    const importedDoc = new Y.Doc();
    Y.applyUpdate(importedDoc, exported);
    assert.equal(importedDoc.getText("body").toString(), "persisted state");
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});
