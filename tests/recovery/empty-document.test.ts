import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import assert from "node:assert/strict";

import * as Y from "yjs";

import { WorkspaceProcessor, createCommand } from "../../packages/command-processor/src/index.js";
import {
  openDurableWorkspace,
  submitDurableCommand,
  validateDurableWorkspace
} from "../../packages/runtime/src/index.js";
import type { JsonObject } from "../../packages/protocol/src/index.js";
import type { CapabilityContext } from "../../packages/projections/src/index.js";

const capability: CapabilityContext = {
  actor_id: "empty-document-test",
  can_read_content: true,
  can_write: true,
  can_accept: true
};

test("empty document remains a first-class processor document", () => {
  const ydoc = new Y.Doc();
  const processor = new WorkspaceProcessor("ws-empty", "ucf-yjs.reducer.v1", { ydoc });

  const created = processor.submit(
    command("ws-empty", "cmd-empty-create", "document.create", { kind: "document", document_id: "doc-empty" }, {
      document_id: "doc-empty",
      title: "Empty document",
      text: ""
    }),
    capability
  );

  assert.equal(created.outcome.code, "UCFY_OK");
  assert.equal(created.projections.workspace_status.document_count, 1);
  assert.deepEqual(created.projections.documents, [
    { document_id: "doc-empty", title: "Empty document", text: "", text_length: 0 }
  ]);

  const reloadedYdoc = new Y.Doc();
  Y.applyUpdate(reloadedYdoc, Y.encodeStateAsUpdate(ydoc));
  const reloaded = WorkspaceProcessor.fromSnapshot(processor.snapshot(), reloadedYdoc);
  assert.deepEqual(reloaded.projections(capability).documents, created.projections.documents);

  const edited = reloaded.submit(
    command("ws-empty", "cmd-empty-edit", "document.replace_range", { kind: "document", document_id: "doc-empty" }, {
      start: 0,
      end: 0,
      text: "Alpha"
    }),
    capability
  );
  assert.equal(edited.outcome.code, "UCFY_OK");
  assert.equal(edited.projections.documents[0]?.text, "Alpha");
});

test("durable empty document validates, reopens, and accepts a later managed edit", async () => {
  const root = await mkdtemp(join(tmpdir(), "ucf-yjs-empty-document-"));
  try {
    const created = await submitDurableCommand({
      root,
      workspace_id: "ws-empty",
      command: command("ws-empty", "cmd-durable-empty-create", "document.create", { kind: "document", document_id: "doc-empty" }, {
        document_id: "doc-empty",
        title: "Empty document",
        text: ""
      }),
      capability
    });

    assert.equal(created.result.outcome.code, "UCFY_OK");
    assert.equal(created.generation_published, true);

    const validation = await validateDurableWorkspace(root, "ws-empty");
    assert.equal(validation.ok, true);

    const reopened = await openDurableWorkspace(root, "ws-empty");
    assert.notEqual(reopened, null);
    assert.deepEqual(reopened?.processor.projections(capability).documents, [
      { document_id: "doc-empty", title: "Empty document", text: "", text_length: 0 }
    ]);

    const edited = await submitDurableCommand({
      root,
      workspace_id: "ws-empty",
      command: command("ws-empty", "cmd-durable-empty-edit", "document.replace_range", { kind: "document", document_id: "doc-empty" }, {
        start: 0,
        end: 0,
        text: "Alpha"
      }),
      capability
    });
    assert.equal(edited.result.outcome.code, "UCFY_OK");
    assert.equal(edited.generation_published, true);

    const reopenedAfterEdit = await openDurableWorkspace(root, "ws-empty");
    assert.equal(reopenedAfterEdit?.processor.projections(capability).documents[0]?.text, "Alpha");
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

function command(
  workspace_id: string,
  command_id: string,
  operation: string,
  target: JsonObject & { readonly kind: string },
  payload: JsonObject
) {
  return createCommand({
    command_id,
    idempotency_key: `idem-${command_id}`,
    actor: { actor_id: "empty-document-test", kind: "agent" },
    workspace_id,
    operation,
    target,
    payload
  });
}
