import { readFileSync, writeFileSync } from "node:fs";

import { WorkspaceProcessor } from "../../command-processor/src/index.js";
import { canonicalJson, type CommandEnvelope, type JsonObject } from "../../protocol/src/index.js";
import type { CapabilityContext } from "../../projections/src/index.js";

export const cliPackage = {
  name: "cli",
  responsibility: "headless JSONL command transport"
} as const;

export const MAX_JSONL_INPUT_BYTES = 1024 * 1024;

export interface CliLineResult {
  readonly outcome: JsonObject;
  readonly projections?: JsonObject;
}

export function runJsonl(
  input: string,
  processor = new WorkspaceProcessor("cli.workspace"),
  capability: CapabilityContext = { actor_id: "cli", can_read_content: true, can_write: true, can_accept: true }
): string {
  if (Buffer.byteLength(input, "utf8") > MAX_JSONL_INPUT_BYTES) {
    throw new Error("JSONL input exceeds maximum size");
  }
  const outputs: string[] = [];
  for (const rawLine of input.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (line.length === 0) {
      continue;
    }
    const command = JSON.parse(line) as CommandEnvelope;
    const result = processor.submit(command, capability);
    const body: CliLineResult = {
      outcome: result.outcome as unknown as JsonObject,
      ...(command.operation === "agent_view.get" || command.operation === "status.get"
        ? { projections: result.projections as unknown as JsonObject }
        : {})
    };
    outputs.push(canonicalJson(body as unknown as JsonObject));
  }
  return outputs.join("\n") + (outputs.length > 0 ? "\n" : "");
}

export function main(): number {
  try {
    const input = readFileSync(0, "utf8");
    writeFileSync(1, runJsonl(input), "utf8");
    return 0;
  } catch (error) {
    writeFileSync(2, `${(error as Error).message}\n`, "utf8");
    return 1;
  }
}

if (process.argv[1]?.endsWith("packages/cli/src/index.js") === true || process.argv[1]?.endsWith("packages\\cli\\src\\index.js") === true) {
  process.exitCode = main();
}
