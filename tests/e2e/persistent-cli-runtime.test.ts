import { existsSync, readdirSync } from "node:fs";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import assert from "node:assert/strict";

import { mainAsync } from "../../packages/cli/src/index.js";
import { createCommand } from "../../packages/command-processor/src/index.js";
import { workspaceStorePath } from "../../packages/runtime/src/index.js";

test("persistent CLI operates on a real named workspace", async () => {
  const root = await mkdtemp(join(tmpdir(), "ucf-yjs-cli-runtime-"));
  const workspace = "ws-cli";
  try {
    const init = await cli(root, workspace, ["workspace", "init"]);
    assert.equal(init.ok, true);
    const initialGenerationCount = generationCount(root, workspace);

    const firstStatus = await cli(root, workspace, ["status"]);
    const secondStatus = await cli(root, workspace, ["status"]);
    assert.equal(firstStatus.generation_published, false);
    assert.equal(secondStatus.generation_published, false);
    assert.equal(generationCount(root, workspace), initialGenerationCount);

    const doc = await submit(root, workspace, "cmd-doc", "document.create", { kind: "document", document_id: "doc-1" }, { document_id: "doc-1", text: "Alpha beta" });
    assert.equal(doc.generation_published, true);
    assert.equal(generationCount(root, workspace) > initialGenerationCount, true);

    await submit(root, workspace, "cmd-cite", "citation.activate", { kind: "document", document_id: "doc-1" }, { citation_id: "c1", start: 0, end: 5, expected_text: "Alpha" });
    const checkpoint = await submit(root, workspace, "cmd-checkpoint", "checkpoint.create", { kind: "workspace" }, {});
    const checkpointId = checkpoint.outcome.affected_resources[0].checkpoint_id;
    assert.equal(typeof checkpointId, "string");

    const list = await cli(root, workspace, ["checkpoint", "list"]);
    assert.equal(list.checkpoints.length, 1);
    assert.equal(list.checkpoints[0].checkpoint_id, checkpointId);
    assert.equal((await cli(root, workspace, ["checkpoint", "verify", "--checkpoint-id", checkpointId])).ok, true);
    assert.equal((await cli(root, workspace, ["checkpoint", "open-readonly", "--checkpoint-id", checkpointId])).mode, "readonly");
    assert.equal((await cli(root, workspace, ["checkpoint", "fork", "--checkpoint-id", checkpointId, "--workspace-id", "ws-cli-fork"])).mode, "fork");
    assert.equal((await cli(root, workspace, ["checkpoint", "reapply", "--checkpoint-id", checkpointId])).mode, "reapply");

    const recovery = await cli(root, workspace, ["recovery", "inspect"]);
    assert.equal(recovery.classification, "clean");
    const providerPath = join(root, "provider.bin");
    const exported = await cli(root, workspace, ["export", "provider", "--output", providerPath]);
    assert.equal(exported.ok, true);
    assert.equal(existsSync(providerPath), true);
    assert.equal((await readFile(providerPath)).byteLength, exported.byte_length);
    const imported = await cli(root, "ws-import", ["import", "provider", "--input", providerPath]);
    assert.equal(imported.ok, false);
    assert.equal(imported.classification, "unclassified_provider_state");
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

async function cli(root: string, workspace: string, args: readonly string[]) {
  return JSON.parse(await mainAsync(["--root", root, "--workspace", workspace, ...args], "")) as Record<string, any>;
}

async function submit(root: string, workspace: string, command_id: string, operation: string, target: Record<string, unknown>, payload: Record<string, unknown>) {
  const command = createCommand({
    command_id,
    idempotency_key: `idem-${command_id}`,
    actor: { actor_id: "cli-test", kind: "agent" },
    workspace_id: workspace,
    operation,
    target: target as { readonly kind: string } & Record<string, any>,
    payload: payload as Record<string, any>
  });
  return JSON.parse(await mainAsync(["--root", root, "--workspace", workspace, "command", "submit"], JSON.stringify(command))) as Record<string, any>;
}

function generationCount(root: string, workspace: string): number {
  return readdirSync(join(workspaceStorePath(root, workspace), "generations")).length;
}
