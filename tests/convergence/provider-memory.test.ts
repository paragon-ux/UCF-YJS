import test from "node:test";
import assert from "node:assert/strict";

import * as Y from "yjs";

import { MemoryProvider } from "../../packages/provider-memory/src/index.js";

test("memory provider exchanges duplicate and reordered updates without changing convergence", () => {
  const provider = new MemoryProvider();
  const left = provider.connect("left");
  const right = provider.connect("right");
  left.getText("body").insert(0, "A");
  right.getText("body").insert(0, "B");

  provider.flush({ duplicate: true, reorder: true });

  assert.equal(left.getText("body").toString(), right.getText("body").toString());
});

test("memory provider reconnect syncs offline local updates", () => {
  const provider = new MemoryProvider();
  const left = provider.connect("left");
  const right = provider.connect("right");
  provider.disconnect("right");
  left.getText("body").insert(0, "hello");
  provider.flush();
  assert.equal(right.getText("body").toString(), "");

  provider.reconnect("right");

  assert.equal(right.getText("body").toString(), "hello");
});

test("memory provider keeps disconnected edits local until reconnect", () => {
  const provider = new MemoryProvider();
  const left = provider.connect("left");
  const right = provider.connect("right");
  provider.disconnect("right");
  right.getText("body").insert(0, "offline");
  provider.sync();
  assert.equal(left.getText("body").toString(), "");

  provider.reconnect("right");

  assert.equal(left.getText("body").toString(), "offline");
  assert.equal(right.getText("body").toString(), "offline");
});

test("memory provider export and import are provider-neutral Yjs state bytes", () => {
  const provider = new MemoryProvider();
  const doc = provider.connect("left");
  doc.getText("body").insert(0, "portable");
  provider.sync();
  const exported = provider.exportState();
  const importedDoc = new Y.Doc();
  Y.applyUpdate(importedDoc, exported);

  assert.equal(importedDoc.getText("body").toString(), "portable");

  const importedProvider = new MemoryProvider();
  importedProvider.importState(exported);
  const connected = importedProvider.connect("after-import");
  assert.equal(connected.getText("body").toString(), "portable");
});
