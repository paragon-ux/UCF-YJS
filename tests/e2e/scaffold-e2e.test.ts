import test from "node:test";
import assert from "node:assert/strict";

test("e2e test entrypoint is wired", () => {
  assert.equal("e2e", "e2e");
});
