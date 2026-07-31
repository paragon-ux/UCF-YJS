import { spawnSync } from "node:child_process";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import assert from "node:assert/strict";

const cliPath = join(process.cwd(), "dist", "packages", "cli", "src", "index.js");

test("runtime CLI process awaits async success before exiting", async () => {
  const root = await mkdtemp(join(tmpdir(), "ucf-yjs-cli-process-"));
  try {
    const result = runCli(["--root", root, "--workspace", "ws-process", "workspace", "init"]);
    assert.equal(result.status, 0);
    assert.equal(result.stderr, "");
    const lines = result.stdout.trim().split(/\r?\n/);
    assert.equal(lines.length, 1);
    assert.equal(JSON.parse(lines[0]!).ok, true);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("runtime CLI process reports async failure with non-zero exit", async () => {
  const root = await mkdtemp(join(tmpdir(), "ucf-yjs-cli-process-fail-"));
  try {
    const result = runCli(["--root", root, "--workspace", "ws-process", "unsupported"]);
    assert.equal(result.status, 1);
    assert.equal(result.stdout, "");
    assert.match(result.stderr, /unsupported command: unsupported/);
    assert.doesNotMatch(result.stderr, /at .*packages/);

    const parseFailure = runCli(["--root", root, "--workspace"]);
    assert.equal(parseFailure.status, 1);
    assert.equal(parseFailure.stdout, "");
    assert.match(parseFailure.stderr, /missing value for --workspace/);
    assert.doesNotMatch(parseFailure.stderr, /at .*packages/);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("runtime CLI stdin handling comes from parsed command shape", async () => {
  const root = await mkdtemp(join(tmpdir(), "ucf-yjs-cli-process-stdin-"));
  try {
    assert.equal(runCli(["--root", root, "--workspace", "submit", "workspace", "init"]).status, 0);
    const status = runCli(["--root", root, "--workspace", "submit", "status"], "not a command payload");
    assert.equal(status.status, 0);
    assert.equal(JSON.parse(status.stdout).generation_published, false);

    const missingPayload = runCli(["--root", root, "--workspace", "submit", "command", "submit"]);
    assert.equal(missingPayload.status, 1);
    assert.equal(missingPayload.stdout, "");
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

function runCli(args: readonly string[], input = "") {
  return spawnSync(process.execPath, [cliPath, ...args], { input, encoding: "utf8" });
}
