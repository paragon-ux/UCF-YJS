import { readFile } from "node:fs/promises";
import test from "node:test";
import assert from "node:assert/strict";

type ApiSnapshot = {
  readonly schema_version: "ucf-yjs.public_api_snapshot.v1";
  readonly exports: Record<string, readonly string[]>;
};

test("package export map matches the M1 public API snapshot", async () => {
  const pkg = JSON.parse(await readFile("package.json", "utf8")) as { readonly license: string; readonly exports: Record<string, unknown> };
  const snapshot = await readSnapshot();
  assert.equal(pkg.license, "MIT");
  assert.deepEqual(Object.keys(pkg.exports).sort(), Object.keys(snapshot.exports).sort());
});

test("public subpath imports expose only snapshotted runtime values", async () => {
  const snapshot = await readSnapshot();
  for (const [subpath, expected] of Object.entries(snapshot.exports)) {
    const imported = await import(`ucf-yjs/${subpath.slice(2)}`) as Record<string, unknown>;
    assert.deepEqual(Object.keys(imported).sort(), [...expected].sort(), subpath);
  }
});

test("private source paths are not importable through the package boundary", async () => {
  const runtimePath = "ucf-yjs/packages/runtime/src/index.js";
  const providerPath = "ucf-yjs/packages/provider-local/src/index.js";
  await assert.rejects(import(runtimePath), /not defined by "exports"|ERR_PACKAGE_PATH_NOT_EXPORTED/);
  await assert.rejects(import(providerPath), /not defined by "exports"|ERR_PACKAGE_PATH_NOT_EXPORTED/);
});

test("dependency and license boundary is explicit", async () => {
  const pkg = JSON.parse(await readFile("package.json", "utf8")) as {
    readonly private: boolean;
    readonly license: string;
    readonly dependencies?: Record<string, string>;
    readonly devDependencies?: Record<string, string>;
  };
  assert.equal(pkg.private, true);
  assert.equal(pkg.license, "MIT");
  assert.deepEqual(Object.keys(pkg.dependencies ?? {}).sort(), ["yjs"]);
  assert.deepEqual(Object.keys(pkg.devDependencies ?? {}).sort(), ["@types/node", "typescript"]);
});

test("protocol declarations do not expose provider internals as public protocol types", async () => {
  const declaration = await readFile("dist/packages/protocol/src/index.d.ts", "utf8");
  assert.equal(declaration.includes("provider_snapshot_id"), false);
  assert.equal(declaration.includes("provider_snapshot_ref"), false);
});

async function readSnapshot(): Promise<ApiSnapshot> {
  return JSON.parse(await readFile("api-surface/m1-public-api.json", "utf8")) as ApiSnapshot;
}
