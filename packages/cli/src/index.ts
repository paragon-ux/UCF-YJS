import { readFileSync, writeFileSync } from "node:fs";

import { WorkspaceProcessor } from "../../command-processor/src/index.js";
import { canonicalJson, domainHash, type CommandEnvelope, type JsonObject } from "../../protocol/src/index.js";
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
  for (const [index, rawLine] of input.split(/\r?\n/).entries()) {
    const line = rawLine.trim();
    if (line.length === 0) {
      continue;
    }
    let command: CommandEnvelope;
    try {
      command = JSON.parse(line) as CommandEnvelope;
    } catch {
      const lineHash = domainHash("ucf-yjs.jsonl_parse_error_line.v1", { line });
      const digest = domainHash("ucf-yjs.jsonl_parse_error.v1", { line_number: index + 1, byte_length: Buffer.byteLength(line, "utf8"), line_hash: lineHash });
      command = {
        command_id: `invalid-jsonl:${index + 1}:${digest}`,
        parse_error: "invalid_json"
      } as unknown as CommandEnvelope;
    }
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
