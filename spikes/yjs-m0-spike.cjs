#!/usr/bin/env node
// M0 disposable spike. This is not UCF-Yjs authority or production code.

const assert = require("node:assert/strict");
const Y = require("yjs");

function docWithClientId(clientID) {
  const doc = new Y.Doc();
  doc.clientID = clientID;
  return doc;
}

function textOf(doc) {
  return doc.getText("doc").toString();
}

function state(doc) {
  return Buffer.from(Y.encodeStateAsUpdate(doc)).toString("base64");
}

function sync(a, b) {
  Y.applyUpdate(a, Y.encodeStateAsUpdate(b));
  Y.applyUpdate(b, Y.encodeStateAsUpdate(a));
}

const a = docWithClientId(1);
const b = docWithClientId(2);
a.getText("doc").insert(0, "A");
b.getText("doc").insert(0, "B");
const ua = Y.encodeStateAsUpdate(a);
const ub = Y.encodeStateAsUpdate(b);
const r1 = docWithClientId(3);
const r2 = docWithClientId(4);
Y.applyUpdate(r1, ua);
Y.applyUpdate(r1, ub);
Y.applyUpdate(r2, ub);
Y.applyUpdate(r2, ua);
assert.equal(textOf(r1), textOf(r2));
const duplicateBefore = state(r1);
Y.applyUpdate(r1, ua);
Y.applyUpdate(r1, ub);
assert.equal(state(r1), duplicateBefore);

const o1 = docWithClientId(5);
const o2 = docWithClientId(6);
o1.getText("doc").insert(0, "hello");
o2.getText("doc").insert(0, "world");
sync(o1, o2);
assert.equal(textOf(o1), textOf(o2));

const anchorDoc = docWithClientId(7);
const anchorText = anchorDoc.getText("doc");
anchorText.insert(0, "abcdef");
const start = Y.createRelativePositionFromTypeIndex(anchorText, 2, -1);
const end = Y.createRelativePositionFromTypeIndex(anchorText, 4, 1);
const anchorReplica = docWithClientId(8);
Y.applyUpdate(anchorReplica, Y.encodeStateAsUpdate(anchorDoc));
anchorDoc.getText("doc").insert(0, "XX");
Y.applyUpdate(anchorReplica, Y.encodeStateAsUpdate(anchorDoc));
const abs1 = Y.createAbsolutePositionFromRelativePosition(start, anchorDoc);
const abs2 = Y.createAbsolutePositionFromRelativePosition(start, anchorReplica);
assert.equal(abs1.index, abs2.index);
const end1 = Y.createAbsolutePositionFromRelativePosition(end, anchorDoc);
const end2 = Y.createAbsolutePositionFromRelativePosition(end, anchorReplica);
assert.equal(end1.index, end2.index);

const boundaryDoc = docWithClientId(9);
const boundaryText = boundaryDoc.getText("doc");
boundaryText.insert(0, "abcd");
const leftAssoc = Y.createRelativePositionFromTypeIndex(boundaryText, 2, -1);
const rightAssoc = Y.createRelativePositionFromTypeIndex(boundaryText, 2, 1);
boundaryText.insert(2, "X");
const leftAbs = Y.createAbsolutePositionFromRelativePosition(leftAssoc, boundaryDoc);
const rightAbs = Y.createAbsolutePositionFromRelativePosition(rightAssoc, boundaryDoc);
assert.ok(leftAbs.index <= rightAbs.index);
assert.notEqual(leftAbs.index, rightAbs.index);

const deleteDoc = docWithClientId(10);
const deleteText = deleteDoc.getText("doc");
deleteText.insert(0, "target");
const delStart = Y.createRelativePositionFromTypeIndex(deleteText, 0, -1);
const delEnd = Y.createRelativePositionFromTypeIndex(deleteText, 6, 1);
deleteText.delete(0, 6);
const deletedStart = Y.createAbsolutePositionFromRelativePosition(delStart, deleteDoc);
const deletedEnd = Y.createAbsolutePositionFromRelativePosition(delEnd, deleteDoc);
assert.ok(deletedStart === null || deletedEnd === null || deletedStart.index >= deletedEnd.index);

const exported = Y.encodeStateAsUpdate(anchorDoc);
const imported = docWithClientId(11);
Y.applyUpdate(imported, exported);
assert.equal(textOf(imported), textOf(anchorDoc));
assert.equal(state(imported), state(anchorDoc));

console.log(
  JSON.stringify(
    {
      ok: true,
      yjs: require("yjs/package.json").version,
      reordered_converges: textOf(r1),
      duplicate_updates_harmless: true,
      offline_exchange_converges: textOf(o1),
      relative_positions: { start: abs1.index, end: end1.index },
      boundary_policy_probe: { left_assoc: leftAbs.index, right_assoc: rightAbs.index },
      deleted_anchor_detectable: true,
      provider_neutral_export_import: true
    },
    null,
    2
  )
);
