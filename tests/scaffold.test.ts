import test from "node:test";
import assert from "node:assert/strict";

import { checkpointStorePackage } from "../packages/checkpoint-store/src/index.js";
import { cliPackage } from "../packages/cli/src/index.js";
import { commandProcessorPackage } from "../packages/command-processor/src/index.js";
import { corePackage } from "../packages/core/src/index.js";
import { domainCitationsPackage } from "../packages/domain-citations/src/index.js";
import { projectionsPackage } from "../packages/projections/src/index.js";
import { protocolPackage } from "../packages/protocol/src/index.js";
import { providerLocalPackage } from "../packages/provider-local/src/index.js";
import { providerMemoryPackage } from "../packages/provider-memory/src/index.js";
import { semanticLogPackage } from "../packages/semantic-log/src/index.js";

test("D1 scaffold exposes every required package responsibility", () => {
  const packages = [
    protocolPackage,
    corePackage,
    commandProcessorPackage,
    semanticLogPackage,
    projectionsPackage,
    checkpointStorePackage,
    providerMemoryPackage,
    providerLocalPackage,
    domainCitationsPackage,
    cliPackage
  ];

  assert.deepEqual(
    packages.map((item) => item.name),
    [
      "protocol",
      "core",
      "command-processor",
      "semantic-log",
      "projections",
      "checkpoint-store",
      "provider-memory",
      "provider-local",
      "domain-citations",
      "cli"
    ]
  );
  assert.ok(packages.every((item) => item.responsibility.length > 0));
});
