import test from "node:test";
import assert from "node:assert/strict";

import { runJsonl } from "../packages/cli/src/index.js";
import { WorkspaceProcessor, createCommand } from "../packages/command-processor/src/index.js";
import type { JsonObject } from "../packages/protocol/src/index.js";

const fullCapability = { actor_id: "actor-1", can_read_content: true, can_write: true, can_accept: true };

function command(command_id: string, operation: string, target: JsonObject & { kind: string }, payload: JsonObject) {
  return createCommand({
    command_id,
    idempotency_key: `idem-${command_id}`,
    actor: { actor_id: "actor-1", kind: "agent" },
    workspace_id: "ws-1",
    operation,
    target,
    payload
  });
}

test("JSONL batch emits committed results before and after a malformed line", () => {
  const processor = new WorkspaceProcessor("ws-1");
  const input = [
    JSON.stringify(command("cmd-doc", "document.create", { kind: "document", document_id: "doc-1" }, { document_id: "doc-1", text: "Alpha" })),
    "{not json",
    JSON.stringify(command("cmd-status", "status.get", { kind: "workspace" }, {}))
  ].join("\n");

  const lines = runJsonl(input, processor, fullCapability)
    .trim()
    .split("\n")
    .map((line) => JSON.parse(line));

  assert.equal(lines.length, 3);
  assert.equal(lines[0].outcome.command_id, "cmd-doc");
  assert.equal(lines[0].outcome.code, "UCFY_OK");
  assert.equal(lines[1].outcome.code, "UCFY_REJECTED_SCHEMA");
  assert.match(lines[1].outcome.command_id, /^invalid-jsonl:2:/);
  assert.equal(lines[2].outcome.command_id, "cmd-status");
  assert.equal(lines[2].outcome.code, "UCFY_OK");
  assert.equal(processor.semanticLog.frontier().workspace_sequence, 3);
});

test("JSONL malformed line IDs include content hash, not only line length", () => {
  const processor = new WorkspaceProcessor("ws-1");
  const first = runJsonl("{bad:1}\n", processor, fullCapability).trim();
  const second = runJsonl("{bad:2}\n", processor, fullCapability).trim();

  assert.notEqual(JSON.parse(first).outcome.command_id, JSON.parse(second).outcome.command_id);
});
