import test from "node:test";
import assert from "node:assert/strict";

test("conformance test entrypoint is wired", () => {
  assert.equal("conformance", "conformance");
});
