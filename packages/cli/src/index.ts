import { readFileSync, writeFileSync } from "node:fs";
import { writeFile } from "node:fs/promises";

import { WorkspaceProcessor } from "../../command-processor/src/index.js";
import { canonicalJson, domainHash, type CommandEnvelope, type JsonObject } from "../../protocol/src/index.js";
import type { CapabilityContext } from "../../projections/src/index.js";
import {
  exportProviderState,
  importProviderState,
  initializeWorkspace,
  inspectWorkspaceGeneration,
  openDurableWorkspace,
  resolveWorkspaceRecovery,
  submitDurableCommand,
  validateDurableWorkspace
} from "../../runtime/src/index.js";

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
  if (process.argv.length > 2) {
    const argv = process.argv.slice(2);
    mainAsync(argv, runtimeCommandNeedsStdin(argv) ? readFileSync(0, "utf8") : "")
      .then((output) => {
        writeFileSync(1, output, "utf8");
      })
      .catch((error: unknown) => {
        writeFileSync(2, `${(error as Error).message}\n`, "utf8");
        process.exitCode = 1;
      });
    return 0;
  }
  try {
    const input = readFileSync(0, "utf8");
    writeFileSync(1, runJsonl(input), "utf8");
    return 0;
  } catch (error) {
    writeFileSync(2, `${(error as Error).message}\n`, "utf8");
    return 1;
  }
}

function runtimeCommandNeedsStdin(argv: readonly string[]): boolean {
  const commands = argv.filter((item, index) => {
    if (!item.startsWith("--")) {
      return index === 0 || !argv[index - 1]?.startsWith("--");
    }
    return false;
  });
  return commands.includes("submit");
}

export async function mainAsync(argv: readonly string[], stdin: string): Promise<string> {
  const parsed = parseRuntimeArgs(argv);
  const capability: CapabilityContext = { actor_id: "cli", can_read_content: true, can_write: true, can_accept: true };
  switch (parsed.command.join(" ")) {
    case "workspace init": {
      const generation = await initializeWorkspace(parsed.root, parsed.workspace);
      return jsonLine({ ok: true, generation_id: generation.generation_id });
    }
    case "workspace validate": {
      return jsonLine(await validateDurableWorkspace(parsed.root, parsed.workspace));
    }
    case "command submit": {
      const command = JSON.parse(stdin) as CommandEnvelope;
      const result = await submitDurableCommand({ root: parsed.root, workspace_id: parsed.workspace, command, capability });
      return jsonLine({
        outcome: result.result.outcome as unknown as JsonObject,
        generation_published: result.generation_published,
        generation_id: result.generation_id
      });
    }
    case "status":
    case "agent-view": {
      const operation = parsed.command[0] === "status" ? "status.get" : "agent_view.get";
      const result = await submitDurableCommand({
        root: parsed.root,
        workspace_id: parsed.workspace,
        capability,
        command: {
          schema_version: "ucf-yjs.command.v1",
          command_id: `cli-${operation}`,
          idempotency_key: `cli-${operation}`,
          actor: { actor_id: "cli", kind: "agent" },
          workspace_id: parsed.workspace,
          operation,
          target: { kind: "workspace" },
          payload: {}
        }
      });
      return jsonLine({
        outcome: result.result.outcome as unknown as JsonObject,
        projections: result.result.projections as unknown as JsonObject,
        generation_published: result.generation_published,
        generation_id: result.generation_id
      });
    }
    case "recovery inspect": {
      return jsonLine(await inspectWorkspaceGeneration(parsed.root, parsed.workspace));
    }
    case "recovery resolve": {
      return jsonLine(await resolveWorkspaceRecovery(parsed.root, parsed.workspace));
    }
    case "checkpoint list": {
      const opened = await openDurableWorkspace(parsed.root, parsed.workspace);
      return jsonLine({ checkpoints: opened?.processor.checkpoints.snapshot() ?? [] });
    }
    case "checkpoint verify":
    case "checkpoint open-readonly":
    case "checkpoint fork":
    case "checkpoint reapply": {
      const opened = await openDurableWorkspace(parsed.root, parsed.workspace);
      if (opened === null) {
        throw new Error("workspace is not initialized");
      }
      const checkpointId = requireOption(parsed.options, "checkpoint-id");
      if (parsed.command[1] === "verify") {
        opened.processor.checkpoints.openReadonly(checkpointId);
        return jsonLine({ ok: true, checkpoint_id: checkpointId });
      }
      if (parsed.command[1] === "open-readonly") {
        return jsonLine(opened.processor.checkpoints.openReadonly(checkpointId) as unknown as JsonObject);
      }
      if (parsed.command[1] === "fork") {
        return jsonLine(opened.processor.checkpoints.fork(checkpointId, parsed.options.workspace_id ?? `${parsed.workspace}.fork`) as unknown as JsonObject);
      }
      return jsonLine(opened.processor.checkpoints.reapply(checkpointId, parsed.options.workspace_id ?? parsed.workspace) as unknown as JsonObject);
    }
    case "export provider": {
      const bytes = await exportProviderState(parsed.root, parsed.workspace);
      const output = requireOption(parsed.options, "output");
      await writeFile(output, bytes);
      return jsonLine({ ok: true, output, byte_length: bytes.byteLength });
    }
    case "import provider": {
      const input = requireOption(parsed.options, "input");
      const generation = await importProviderState(parsed.root, parsed.workspace, readFileSync(input));
      return jsonLine({ ok: true, generation_id: generation.generation_id });
    }
    default:
      throw new Error(`unsupported command: ${parsed.command.join(" ")}`);
  }
}

function parseRuntimeArgs(argv: readonly string[]): {
  readonly root: string;
  readonly workspace: string;
  readonly command: readonly string[];
  readonly options: Record<string, string>;
} {
  const options: Record<string, string> = {};
  const command: string[] = [];
  for (let index = 0; index < argv.length; index += 1) {
    const item = argv[index]!;
    if (item.startsWith("--")) {
      const key = item.slice(2).replace(/-/g, "_");
      const value = argv[index + 1];
      if (value === undefined || value.startsWith("--")) {
        throw new Error(`missing value for ${item}`);
      }
      options[key] = value;
      index += 1;
    } else {
      command.push(item);
    }
  }
  return {
    root: options.root ?? ".",
    workspace: options.workspace ?? "workspace.local",
    command,
    options
  };
}

function requireOption(options: Readonly<Record<string, string>>, key: string): string {
  const value = options[key.replace(/-/g, "_")];
  if (value === undefined) {
    throw new Error(`missing --${key}`);
  }
  return value;
}

function jsonLine(value: unknown): string {
  return `${canonicalJson(value as JsonObject)}\n`;
}

if (process.argv[1]?.endsWith("packages/cli/src/index.js") === true || process.argv[1]?.endsWith("packages\\cli\\src\\index.js") === true) {
  process.exitCode = main();
}
