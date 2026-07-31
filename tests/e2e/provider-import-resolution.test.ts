import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import assert from "node:assert/strict";

import * as Y from "yjs";

import { mainAsync } from "../../packages/cli/src/index.js";
import { WorkspaceProcessor, createCommand } from "../../packages/command-processor/src/index.js";
import {
  WorkspaceGenerationError,
  discardUnclassifiedProviderImport,
  importProviderState,
  inspectUnclassifiedProviderImport,
  listUnclassifiedProviderImports,
  publishWorkspaceGeneration,
  submitDurableCommand
} from "../../packages/runtime/src/index.js";

const capability = { actor_id: "runtime-test", can_read_content: true, can_write: true, can_accept: true };

function command(command_id: string, operation: string) {
  return createCommand({
    command_id,
    idempotency_key: `idem-${command_id}`,
    actor: { actor_id: "runtime-test", kind: "agent" },
    workspace_id: "ws-1",
    operation,
    target: { kind: "workspace" },
    payload: {}
  });
}

test("unclassified provider intake can be inspected and explicitly discarded", async () => {
  const dir = await mkdtemp(join(tmpdir(), "ucf-yjs-import-resolution-"));
  try {
    const committedDoc = new Y.Doc();
    const processor = new WorkspaceProcessor("ws-1", "ucf-yjs.reducer.v1", { ydoc: committedDoc });
    processor.submit(
      createCommand({
        command_id: "cmd-doc",
        idempotency_key: "idem-cmd-doc",
        actor: { actor_id: "runtime-test", kind: "agent" },
        workspace_id: "ws-1",
        operation: "document.create",
        target: { kind: "document", document_id: "doc-1" },
        payload: { document_id: "doc-1", text: "Alpha" }
      }),
      capability
    );
    await publishWorkspaceGeneration({ root: dir, workspace_id: "ws-1", processor, ydoc: committedDoc });

    const importedDoc = new Y.Doc();
    importedDoc.getText("doc-1").insert(0, "Unclassified replacement");
    const imported = await importProviderState(dir, "ws-1", Y.encodeStateAsUpdate(importedDoc));
    assert.equal(imported.ok, false);

    const listed = await listUnclassifiedProviderImports(dir, "ws-1");
    assert.equal(listed.length, 1);
    assert.equal(listed[0]?.import_id, imported.import_id);
    assert.deepEqual(listed[0]?.documents.map((item) => item.document_id), ["doc-1"]);

    const inspected = await inspectUnclassifiedProviderImport(dir, "ws-1", imported.import_id);
    assert.equal(inspected.ok, true);
    if (inspected.ok) {
      assert.equal(inspected.inspection.documents[0]?.text_length, "Unclassified replacement".length);
    }

    await assert.rejects(
      submitDurableCommand({ root: dir, workspace_id: "ws-1", command: command("checkpoint-blocked", "checkpoint.create"), capability }),
      WorkspaceGenerationError
    );

    const cliList = JSON.parse((await mainAsync(["--root", dir, "--workspace", "ws-1", "import", "provider", "list"], "")).trim()) as {
      readonly imports: readonly { readonly import_id: string }[];
    };
    assert.equal(cliList.imports[0]?.import_id, imported.import_id);

    const cliInspect = JSON.parse((await mainAsync([
      "--root", dir,
      "--workspace", "ws-1",
      "import", "provider", "inspect",
      "--import-id", imported.import_id
    ], "")).trim()) as { readonly ok: boolean; readonly classification: string };
    assert.equal(cliInspect.ok, true);
    assert.equal(cliInspect.classification, "pending");

    const cliDiscard = JSON.parse((await mainAsync([
      "--root", dir,
      "--workspace", "ws-1",
      "import", "provider", "discard",
      "--import-id", imported.import_id
    ], "")).trim()) as { readonly ok: boolean; readonly classification: string };
    assert.equal(cliDiscard.ok, true);
    assert.equal(cliDiscard.classification, "discarded");
    assert.deepEqual(await listUnclassifiedProviderImports(dir, "ws-1"), []);

    const checkpoint = await submitDurableCommand({
      root: dir,
      workspace_id: "ws-1",
      command: command("checkpoint-after-discard", "checkpoint.create"),
      capability
    });
    assert.equal(checkpoint.generation_published, true);

    const repeated = await discardUnclassifiedProviderImport(dir, "ws-1", imported.import_id, { actor_id: "operator-1" });
    assert.equal(repeated.classification, "already_discarded");
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});
