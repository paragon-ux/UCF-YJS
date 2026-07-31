import {
  OUTCOME_SCHEMA_VERSION,
  commandPayloadDigest,
  commandRecordHash,
  outcomeRecordHash,
  validateCommandEnvelope,
  validateOutcomeEnvelope,
  type CommandEnvelope,
  type JsonObject,
  type OutcomeCode,
  type OutcomeEnvelope
} from "../../protocol/src/index.js";

export const semanticLogPackage = {
  name: "semantic-log",
  responsibility: "durable command and outcome records"
} as const;

export type IdempotencyDecision =
  | "new"
  | "duplicate_command"
  | "duplicate_same_payload"
  | "conflict_different_payload";

export interface CommandLogRecord {
  readonly record_type: "command";
  readonly command_id: string;
  readonly command_hash: string;
  readonly payload_digest: string;
  readonly command: CommandEnvelope;
}

export interface IdempotencyLogRecord {
  readonly record_type: "idempotency";
  readonly command_id: string;
  readonly idempotency_key: string;
  readonly payload_digest: string;
  readonly decision: IdempotencyDecision;
  readonly original_command_id: string | null;
  readonly original_payload_digest: string | null;
}

export interface OutcomeLogRecord {
  readonly record_type: "outcome";
  readonly command_id: string;
  readonly workspace_sequence: number;
  readonly outcome_hash: string;
  readonly previous_outcome_hash: string | null;
  readonly outcome: OutcomeEnvelope & { readonly outcome_hash: string };
}

export type SemanticLogRecord = CommandLogRecord | IdempotencyLogRecord | OutcomeLogRecord;

export interface OutcomeDraft {
  readonly outcome: "committed" | "rejected" | "conflict";
  readonly code: OutcomeCode;
  readonly previous_live_version: string | null;
  readonly new_live_version: string | null;
  readonly affected_resources?: readonly JsonObject[];
  readonly events?: readonly JsonObject[];
  readonly allowed_actions?: readonly string[];
  readonly diagnostics?: readonly JsonObject[];
}

export interface AppendResult {
  readonly decision: IdempotencyDecision;
  readonly command_appended: boolean;
  readonly outcome_appended: boolean;
  readonly outcome: OutcomeEnvelope & { readonly outcome_hash: string };
}

export interface ValidationIssue {
  readonly code:
    | "LOG_CORRUPT_COMMAND"
    | "LOG_CORRUPT_OUTCOME"
    | "LOG_DUPLICATE_COMMAND"
    | "LOG_DUPLICATE_OUTCOME"
    | "LOG_GAP"
    | "LOG_HASH_MISMATCH"
    | "LOG_MISSING_COMMAND"
    | "LOG_MISSING_OUTCOME"
    | "LOG_IDEMPOTENCY_MISMATCH";
  readonly message: string;
  readonly index: number;
}

export type LogValidationResult =
  | { readonly ok: true; readonly frontier: SemanticFrontier }
  | { readonly ok: false; readonly issues: readonly ValidationIssue[] };

export interface SemanticFrontier {
  readonly workspace_sequence: number;
  readonly outcome_hash: string | null;
}

export class SemanticLog {
  private readonly records: SemanticLogRecord[];

  constructor(records: readonly SemanticLogRecord[] = []) {
    const validation = validateSemanticLog(records);
    if (!validation.ok) {
      throw new Error(`invalid semantic log: ${validation.issues.map((item) => item.code).join(",")}`);
    }
    this.records = records.map((record) => structuredClone(record));
  }

  append(command: CommandEnvelope, draft: OutcomeDraft): AppendResult {
    const commandValidation = validateCommandEnvelope(command);
    if (!commandValidation.ok) {
      throw new Error(`invalid command: ${commandValidation.issues.map((item) => item.path).join(",")}`);
    }

    const payloadDigest = commandPayloadDigest(command);
    const existingCommand = this.findCommand(command.command_id);
    if (existingCommand !== undefined) {
      const existingOutcome = this.requireOutcome(command.command_id);
      this.records.push(
        idempotencyRecord(command, payloadDigest, "duplicate_command", command.command_id, existingCommand.payload_digest)
      );
      return {
        decision: "duplicate_command",
        command_appended: false,
        outcome_appended: false,
        outcome: structuredClone(existingOutcome.outcome)
      };
    }

    const matchingIdempotentOutcome = this.findOutcomeByIdempotencyKeyAndPayload(command.idempotency_key, payloadDigest);
    if (matchingIdempotentOutcome !== undefined) {
      this.records.push(
        idempotencyRecord(
          command,
          payloadDigest,
          "duplicate_same_payload",
          matchingIdempotentOutcome.command.command_id,
          matchingIdempotentOutcome.command.payload_digest
        )
      );
      return {
        decision: "duplicate_same_payload",
        command_appended: false,
        outcome_appended: false,
        outcome: structuredClone(matchingIdempotentOutcome.outcome.outcome)
      };
    }

    const idempotentOriginal = this.findFirstCommandByIdempotencyKey(command.idempotency_key);
    if (idempotentOriginal !== undefined) {
      return this.appendNew(
        command,
        {
          outcome: "conflict",
          code: "UCFY_CONFLICT_IDEMPOTENCY_PAYLOAD",
          previous_live_version: draft.previous_live_version,
          new_live_version: draft.previous_live_version,
          affected_resources: [],
          events: [],
          allowed_actions: [],
          diagnostics: [
            {
              conflict: "idempotency_key_reused_with_different_payload",
              original_command_id: idempotentOriginal.command_id
            }
          ]
        },
        "conflict_different_payload",
        idempotentOriginal.command_id,
        idempotentOriginal.payload_digest
      );
    }

    return this.appendNew(command, draft, "new", null, null);
  }

  snapshot(): readonly SemanticLogRecord[] {
    return this.records.map((record) => structuredClone(record));
  }

  frontier(): SemanticFrontier {
    const outcome = [...this.records].reverse().find((record): record is OutcomeLogRecord => record.record_type === "outcome");
    return {
      workspace_sequence: outcome?.workspace_sequence ?? 0,
      outcome_hash: outcome?.outcome_hash ?? null
    };
  }

  outcomes(): readonly (OutcomeEnvelope & { readonly outcome_hash: string })[] {
    return this.records
      .filter((record): record is OutcomeLogRecord => record.record_type === "outcome")
      .map((record) => structuredClone(record.outcome));
  }

  setOutcomeNewLiveVersion(commandId: string, newLiveVersion: string): OutcomeEnvelope & { readonly outcome_hash: string } {
    const index = this.records.findIndex(
      (record): record is OutcomeLogRecord => record.record_type === "outcome" && record.command_id === commandId
    );
    if (index < 0) {
      throw new Error(`unknown outcome: ${commandId}`);
    }
    const record = this.records[index] as OutcomeLogRecord;
    const outcome = {
      ...record.outcome,
      new_live_version: newLiveVersion
    };
    if (outcomeRecordHash(outcome) !== record.outcome_hash) {
      throw new Error(`new_live_version changed outcome hash for command: ${commandId}`);
    }
    const updated: OutcomeLogRecord = {
      ...record,
      outcome: structuredClone(outcome)
    };
    this.records[index] = updated;
    return structuredClone(outcome);
  }

  private appendNew(
    command: CommandEnvelope,
    draft: OutcomeDraft,
    decision: IdempotencyDecision,
    originalCommandId: string | null,
    originalPayloadDigest: string | null
  ): AppendResult {
    const storedCommand = structuredClone(command);
    const commandRecord: CommandLogRecord = {
      record_type: "command",
      command_id: storedCommand.command_id,
      command_hash: commandRecordHash(storedCommand),
      payload_digest: commandPayloadDigest(storedCommand),
      command: storedCommand
    };
    const frontier = this.frontier();
    const outcomeWithoutHash: OutcomeEnvelope = {
      schema_version: OUTCOME_SCHEMA_VERSION,
      command_id: storedCommand.command_id,
      outcome: draft.outcome,
      code: draft.code,
      workspace_sequence: frontier.workspace_sequence + 1,
      previous_outcome_hash: frontier.outcome_hash,
      previous_live_version: draft.previous_live_version,
      new_live_version: draft.new_live_version,
      affected_resources: draft.affected_resources ?? [],
      events: draft.events ?? [],
      allowed_actions: draft.allowed_actions ?? [],
      diagnostics: draft.diagnostics ?? []
    };
    const outcome_hash = outcomeRecordHash(outcomeWithoutHash);
    const outcome = { ...outcomeWithoutHash, outcome_hash };
    const outcomeValidation = validateOutcomeEnvelope(outcome);
    if (!outcomeValidation.ok) {
      throw new Error(`invalid outcome: ${outcomeValidation.issues.map((item) => item.path).join(",")}`);
    }
    const outcomeRecord: OutcomeLogRecord = {
      record_type: "outcome",
      command_id: storedCommand.command_id,
      workspace_sequence: outcome.workspace_sequence,
      outcome_hash,
      previous_outcome_hash: outcome.previous_outcome_hash,
      outcome: structuredClone(outcome)
    };
    this.records.push(
      commandRecord,
      idempotencyRecord(storedCommand, commandRecord.payload_digest, decision, originalCommandId, originalPayloadDigest),
      outcomeRecord
    );
    return {
      decision,
      command_appended: true,
      outcome_appended: true,
      outcome: structuredClone(outcome)
    };
  }

  private findCommand(commandId: string): CommandLogRecord | undefined {
    return this.records.find(
      (record): record is CommandLogRecord => record.record_type === "command" && record.command_id === commandId
    );
  }

  private requireOutcome(commandId: string): OutcomeLogRecord {
    const outcome = this.records.find(
      (record): record is OutcomeLogRecord => record.record_type === "outcome" && record.command_id === commandId
    );
    if (outcome === undefined) {
      throw new Error(`semantic log recovery required for command without outcome: ${commandId}`);
    }
    return outcome;
  }

  private findOutcomeByIdempotencyKeyAndPayload(
    idempotencyKey: string,
    payloadDigest: string
  ): { readonly command: CommandLogRecord; readonly outcome: OutcomeLogRecord } | undefined {
    for (const record of this.records) {
      if (
        record.record_type === "command" &&
        record.command.idempotency_key === idempotencyKey &&
        record.payload_digest === payloadDigest
      ) {
        return { command: record, outcome: this.requireOutcome(record.command_id) };
      }
    }
    return undefined;
  }

  private findFirstCommandByIdempotencyKey(idempotencyKey: string): CommandLogRecord | undefined {
    return this.records.find(
      (record): record is CommandLogRecord =>
        record.record_type === "command" && record.command.idempotency_key === idempotencyKey
    );
  }
}

export function validateSemanticLog(records: readonly SemanticLogRecord[]): LogValidationResult {
  const issues: ValidationIssue[] = [];
  const commands = new Map<string, CommandLogRecord>();
  const outcomes = new Map<string, OutcomeLogRecord>();
  let expectedSequence = 1;
  let previousOutcomeHash: string | null = null;

  records.forEach((record, index) => {
    if (record.record_type === "command") {
      const commandValidation = validateCommandEnvelope(record.command);
      if (!commandValidation.ok || record.command_id !== record.command.command_id) {
        issues.push(issue("LOG_CORRUPT_COMMAND", "command record does not match protocol command", index));
        return;
      }
      if (commands.has(record.command_id)) {
        issues.push(issue("LOG_DUPLICATE_COMMAND", "duplicate command record", index));
      }
      if (record.command_hash !== commandRecordHash(record.command)) {
        issues.push(issue("LOG_HASH_MISMATCH", "command hash mismatch", index));
      }
      if (record.payload_digest !== commandPayloadDigest(record.command)) {
        issues.push(issue("LOG_HASH_MISMATCH", "command payload digest mismatch", index));
      }
      commands.set(record.command_id, record);
      return;
    }

    if (record.record_type === "idempotency") {
      validateIdempotencyRecord(record, commands, issues, index);
      return;
    }

    const outcomeValidation = validateOutcomeEnvelope(record.outcome);
    if (!outcomeValidation.ok || record.command_id !== record.outcome.command_id) {
      issues.push(issue("LOG_CORRUPT_OUTCOME", "outcome record does not match protocol outcome", index));
      return;
    }
    if (!commands.has(record.command_id)) {
      issues.push(issue("LOG_MISSING_COMMAND", "outcome references missing command", index));
    }
    if (outcomes.has(record.command_id)) {
      issues.push(issue("LOG_DUPLICATE_OUTCOME", "duplicate outcome record", index));
    }
    if (record.workspace_sequence !== expectedSequence || record.outcome.workspace_sequence !== expectedSequence) {
      issues.push(issue("LOG_GAP", "workspace sequence gap or reorder", index));
    }
    if (record.previous_outcome_hash !== previousOutcomeHash || record.outcome.previous_outcome_hash !== previousOutcomeHash) {
      issues.push(issue("LOG_HASH_MISMATCH", "previous outcome hash mismatch", index));
    }
    const recomputedOutcomeHash = outcomeRecordHash(record.outcome);
    if (record.outcome_hash !== recomputedOutcomeHash || record.outcome.outcome_hash !== recomputedOutcomeHash) {
      issues.push(issue("LOG_HASH_MISMATCH", "outcome hash mismatch", index));
    }
    outcomes.set(record.command_id, record);
    expectedSequence += 1;
    previousOutcomeHash = record.outcome_hash;
  });

  for (const commandId of commands.keys()) {
    if (!outcomes.has(commandId)) {
      issues.push(issue("LOG_MISSING_OUTCOME", `command ${commandId} has no outcome`, records.length));
    }
  }

  if (issues.length > 0) {
    return { ok: false, issues };
  }
  return {
    ok: true,
    frontier: {
      workspace_sequence: expectedSequence - 1,
      outcome_hash: previousOutcomeHash
    }
  };
}

function idempotencyRecord(
  command: CommandEnvelope,
  payloadDigest: string,
  decision: IdempotencyDecision,
  originalCommandId: string | null,
  originalPayloadDigest: string | null
): IdempotencyLogRecord {
  return {
    record_type: "idempotency",
    command_id: command.command_id,
    idempotency_key: command.idempotency_key,
    payload_digest: payloadDigest,
    decision,
    original_command_id: originalCommandId,
    original_payload_digest: originalPayloadDigest
  };
}

function validateIdempotencyRecord(
  record: IdempotencyLogRecord,
  commands: ReadonlyMap<string, CommandLogRecord>,
  issues: ValidationIssue[],
  index: number
): void {
  if (record.decision === "new" || record.decision === "conflict_different_payload") {
    const command = commands.get(record.command_id);
    if (command === undefined || command.command.idempotency_key !== record.idempotency_key) {
      issues.push(issue("LOG_IDEMPOTENCY_MISMATCH", "idempotency decision does not match command", index));
    }
    if (command !== undefined && command.payload_digest !== record.payload_digest) {
      issues.push(issue("LOG_IDEMPOTENCY_MISMATCH", "idempotency payload digest mismatch", index));
    }
  }
  if (record.decision === "new" && (record.original_command_id !== null || record.original_payload_digest !== null)) {
    issues.push(issue("LOG_IDEMPOTENCY_MISMATCH", "new idempotency decision must not reference an original command", index));
  }
  if (
    record.decision !== "new" &&
    (record.original_command_id === null || record.original_payload_digest === null)
  ) {
    issues.push(issue("LOG_IDEMPOTENCY_MISMATCH", "duplicate or conflict idempotency decision must reference an original command", index));
  }
  if (record.original_command_id !== null && record.original_payload_digest !== null) {
    const original = commands.get(record.original_command_id);
    if (original === undefined || original.payload_digest !== record.original_payload_digest) {
      issues.push(issue("LOG_IDEMPOTENCY_MISMATCH", "idempotency original command reference is invalid", index));
    }
    if (record.decision === "duplicate_same_payload" && original !== undefined && record.payload_digest !== original.payload_digest) {
      issues.push(issue("LOG_IDEMPOTENCY_MISMATCH", "same-payload idempotency retry does not match original payload", index));
    }
    if (record.decision === "conflict_different_payload" && original !== undefined && record.payload_digest === original.payload_digest) {
      issues.push(issue("LOG_IDEMPOTENCY_MISMATCH", "different-payload idempotency conflict matches original payload", index));
    }
  }
}

function issue(code: ValidationIssue["code"], message: string, index: number): ValidationIssue {
  return { code, message, index };
}
