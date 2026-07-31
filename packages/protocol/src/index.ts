import { createHash } from "node:crypto";

export const COMMAND_SCHEMA_VERSION = "ucf-yjs.command.v1";
export const OUTCOME_SCHEMA_VERSION = "ucf-yjs.outcome.v1";

export const protocolPackage = {
  name: "protocol",
  responsibility: "schema-versioned command and outcome envelopes"
} as const;

export type JsonPrimitive = string | number | boolean | null;
export type JsonValue = JsonPrimitive | JsonObject | JsonValue[];
export type JsonObject = { readonly [key: string]: JsonValue };

export type ActorKind = "human" | "agent" | "service";
export type OutcomeCategory = "committed" | "rejected" | "conflict";

export type OutcomeCode =
  | "UCFY_OK"
  | "UCFY_REJECTED_SCHEMA"
  | "UCFY_REJECTED_UNSUPPORTED_SCHEMA"
  | "UCFY_REJECTED_PERMISSION"
  | "UCFY_CONFLICT_STALE_OBSERVATION"
  | "UCFY_CONFLICT_IDEMPOTENCY_PAYLOAD"
  | "UCFY_CONFLICT_INVALID_TRANSITION"
  | "UCFY_CONFLICT_AMBIGUOUS_REFERENCE"
  | "UCFY_CONFLICT_CHANGED_EVIDENCE"
  | "UCFY_CONFLICT_MISSING_TARGET"
  | "UCFY_RECOVERY_REQUIRED";

export interface Actor {
  readonly actor_id: string;
  readonly kind: ActorKind;
  readonly display?: string;
}

export interface ObservedState {
  readonly live_version?: string;
  readonly checkpoint_id?: string;
}

export interface CommandTarget {
  readonly kind: string;
  readonly [key: string]: JsonValue;
}

export interface CommandEnvelope {
  readonly schema_version: typeof COMMAND_SCHEMA_VERSION;
  readonly command_id: string;
  readonly idempotency_key: string;
  readonly actor: Actor;
  readonly workspace_id: string;
  readonly observed?: ObservedState;
  readonly operation: string;
  readonly target: CommandTarget;
  readonly payload: JsonObject;
}

export interface OutcomeEnvelope {
  readonly schema_version: typeof OUTCOME_SCHEMA_VERSION;
  readonly command_id: string;
  readonly outcome: OutcomeCategory;
  readonly code: OutcomeCode;
  readonly workspace_sequence: number;
  readonly previous_outcome_hash: string | null;
  readonly outcome_hash?: string;
  readonly previous_live_version: string | null;
  readonly new_live_version: string | null;
  readonly affected_resources: readonly JsonObject[];
  readonly events: readonly JsonObject[];
  readonly allowed_actions: readonly string[];
  readonly diagnostics: readonly JsonObject[];
}

export interface ValidationIssue {
  readonly code: OutcomeCode;
  readonly message: string;
  readonly path: string;
}

export type ValidationResult<T> =
  | { readonly ok: true; readonly value: T }
  | { readonly ok: false; readonly issues: readonly ValidationIssue[] };

const FORBIDDEN_PROVIDER_FIELDS = new Set([
  "provider_snapshot_id",
  "provider_snapshot_ref",
  "yjs_update",
  "raw_yjs_update",
  "raw_update"
]);

const OUTCOME_CODES = new Set<OutcomeCode>([
  "UCFY_OK",
  "UCFY_REJECTED_SCHEMA",
  "UCFY_REJECTED_UNSUPPORTED_SCHEMA",
  "UCFY_REJECTED_PERMISSION",
  "UCFY_CONFLICT_STALE_OBSERVATION",
  "UCFY_CONFLICT_IDEMPOTENCY_PAYLOAD",
  "UCFY_CONFLICT_INVALID_TRANSITION",
  "UCFY_CONFLICT_AMBIGUOUS_REFERENCE",
  "UCFY_CONFLICT_CHANGED_EVIDENCE",
  "UCFY_CONFLICT_MISSING_TARGET",
  "UCFY_RECOVERY_REQUIRED"
]);

export function canonicalJson(value: JsonValue): string {
  return canonicalize(value);
}

export function domainHash(domain: string, value: JsonValue): string {
  const canonical = canonicalJson(value);
  const digest = createHash("sha256")
    .update(domain, "utf8")
    .update("\n", "utf8")
    .update(canonical, "utf8")
    .digest("hex");
  return `sha256:${digest}`;
}

export function commandPayloadDigest(command: Pick<CommandEnvelope, "operation" | "target" | "payload">): string {
  return domainHash("ucf-yjs.command_payload.v1", {
    operation: command.operation,
    target: command.target,
    payload: command.payload
  });
}

export function commandRecordHash(command: CommandEnvelope): string {
  return domainHash("ucf-yjs.command_record.v1", command as unknown as JsonObject);
}

export function outcomeRecordHash(outcome: OutcomeEnvelope): string {
  const { outcome_hash: _outcomeHash, ...withoutHash } = outcome;
  return domainHash("ucf-yjs.outcome_record.v1", withoutHash as unknown as JsonObject);
}

export function validateCommandEnvelope(value: unknown): ValidationResult<CommandEnvelope> {
  const issues: ValidationIssue[] = [];
  if (!isRecord(value)) {
    return { ok: false, issues: [issue("UCFY_REJECTED_SCHEMA", "command must be an object", "$")] };
  }
  if (value.schema_version !== COMMAND_SCHEMA_VERSION) {
    return {
      ok: false,
      issues: [
        issue(
          value.schema_version === undefined ? "UCFY_REJECTED_SCHEMA" : "UCFY_REJECTED_UNSUPPORTED_SCHEMA",
          "unsupported command schema version",
          "$.schema_version"
        )
      ]
    };
  }
  rejectForbiddenProviderFields(value, "$", issues);
  requireJsonValue(value, "$", issues);
  requireString(value, "command_id", issues);
  requireString(value, "idempotency_key", issues);
  requireString(value, "workspace_id", issues);
  requireString(value, "operation", issues);
  if (!isRecord(value.actor)) {
    issues.push(issue("UCFY_REJECTED_SCHEMA", "actor must be an object", "$.actor"));
  } else {
    requireString(value.actor, "actor_id", issues, "$.actor");
    if (value.actor.kind !== "human" && value.actor.kind !== "agent" && value.actor.kind !== "service") {
      issues.push(issue("UCFY_REJECTED_SCHEMA", "actor.kind is unsupported", "$.actor.kind"));
    }
    if ("display" in value.actor && typeof value.actor.display !== "string") {
      issues.push(issue("UCFY_REJECTED_SCHEMA", "actor.display must be a string", "$.actor.display"));
    }
  }
  if ("observed" in value && value.observed !== undefined) {
    if (!isRecord(value.observed)) {
      issues.push(issue("UCFY_REJECTED_SCHEMA", "observed must be an object", "$.observed"));
    } else {
      optionalString(value.observed, "live_version", issues, "$.observed");
      optionalString(value.observed, "checkpoint_id", issues, "$.observed");
    }
  }
  if (!isRecord(value.target)) {
    issues.push(issue("UCFY_REJECTED_SCHEMA", "target must be an object", "$.target"));
  } else {
    requireString(value.target, "kind", issues, "$.target");
    requireJsonValue(value.target, "$.target", issues);
  }
  if (!isRecord(value.payload)) {
    issues.push(issue("UCFY_REJECTED_SCHEMA", "payload must be an object", "$.payload"));
  } else {
    requireJsonValue(value.payload, "$.payload", issues);
  }
  if (issues.length > 0) {
    return { ok: false, issues };
  }
  return { ok: true, value: value as unknown as CommandEnvelope };
}

export function validateOutcomeEnvelope(value: unknown): ValidationResult<OutcomeEnvelope> {
  const issues: ValidationIssue[] = [];
  if (!isRecord(value)) {
    return { ok: false, issues: [issue("UCFY_REJECTED_SCHEMA", "outcome must be an object", "$")] };
  }
  if (value.schema_version !== OUTCOME_SCHEMA_VERSION) {
    return {
      ok: false,
      issues: [
        issue(
          value.schema_version === undefined ? "UCFY_REJECTED_SCHEMA" : "UCFY_REJECTED_UNSUPPORTED_SCHEMA",
          "unsupported outcome schema version",
          "$.schema_version"
        )
      ]
    };
  }
  requireJsonValue(value, "$", issues);
  requireString(value, "command_id", issues);
  if (value.outcome !== "committed" && value.outcome !== "rejected" && value.outcome !== "conflict") {
    issues.push(issue("UCFY_REJECTED_SCHEMA", "outcome category is unsupported", "$.outcome"));
  }
  if (typeof value.code !== "string" || !OUTCOME_CODES.has(value.code as OutcomeCode)) {
    issues.push(issue("UCFY_REJECTED_SCHEMA", "outcome code is unsupported", "$.code"));
  }
  const workspaceSequence = value.workspace_sequence;
  if (typeof workspaceSequence !== "number" || !Number.isInteger(workspaceSequence) || workspaceSequence < 0) {
    issues.push(issue("UCFY_REJECTED_SCHEMA", "workspace_sequence must be a non-negative integer", "$.workspace_sequence"));
  }
  requireNullableString(value, "previous_outcome_hash", issues);
  requireNullableString(value, "previous_live_version", issues);
  requireNullableString(value, "new_live_version", issues);
  requireObjectArray(value, "affected_resources", issues);
  requireObjectArray(value, "events", issues);
  requireStringArray(value, "allowed_actions", issues);
  requireObjectArray(value, "diagnostics", issues);
  if (issues.length > 0) {
    return { ok: false, issues };
  }
  return { ok: true, value: value as unknown as OutcomeEnvelope };
}

function canonicalize(value: unknown): string {
  if (value === null) {
    return "null";
  }
  if (typeof value === "string") {
    return JSON.stringify(value.normalize("NFC"));
  }
  if (typeof value === "boolean") {
    return value ? "true" : "false";
  }
  if (typeof value === "number") {
    if (!Number.isSafeInteger(value)) {
      throw new TypeError("canonical JSON supports only safe integers");
    }
    return JSON.stringify(Object.is(value, -0) ? 0 : value);
  }
  if (Array.isArray(value)) {
    return `[${value.map((item) => canonicalize(item)).join(",")}]`;
  }
  if (isRecord(value)) {
    const normalizedEntries = new Map<string, unknown>();
    for (const [rawKey, child] of Object.entries(value)) {
      const key = rawKey.normalize("NFC");
      if (normalizedEntries.has(key)) {
        throw new TypeError(`canonical JSON object has duplicate normalized key ${key}`);
      }
      normalizedEntries.set(key, child);
    }
    const keys = [...normalizedEntries.keys()].sort();
    const parts: string[] = [];
    for (const key of keys) {
      const child = normalizedEntries.get(key);
      if (child === undefined) {
        throw new TypeError(`canonical JSON does not support undefined at ${key}`);
      }
      parts.push(`${JSON.stringify(key.normalize("NFC"))}:${canonicalize(child)}`);
    }
    return `{${parts.join(",")}}`;
  }
  throw new TypeError(`canonical JSON cannot encode ${typeof value}`);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function issue(code: OutcomeCode, message: string, path: string): ValidationIssue {
  return { code, message, path };
}

function requireString(
  value: Record<string, unknown>,
  key: string,
  issues: ValidationIssue[],
  basePath = "$"
): void {
  if (typeof value[key] !== "string") {
    issues.push(issue("UCFY_REJECTED_SCHEMA", `${key} must be a string`, `${basePath}.${key}`));
  }
}

function optionalString(
  value: Record<string, unknown>,
  key: string,
  issues: ValidationIssue[],
  basePath = "$"
): void {
  if (key in value && value[key] !== undefined && typeof value[key] !== "string") {
    issues.push(issue("UCFY_REJECTED_SCHEMA", `${key} must be a string`, `${basePath}.${key}`));
  }
}

function requireNullableString(
  value: Record<string, unknown>,
  key: string,
  issues: ValidationIssue[],
  basePath = "$"
): void {
  if (!(key in value) || (value[key] !== null && typeof value[key] !== "string")) {
    issues.push(issue("UCFY_REJECTED_SCHEMA", `${key} must be a string or null`, `${basePath}.${key}`));
  }
}

function requireObjectArray(value: Record<string, unknown>, key: string, issues: ValidationIssue[]): void {
  const array = value[key];
  if (!Array.isArray(array)) {
    issues.push(issue("UCFY_REJECTED_SCHEMA", `${key} must be an array`, `$.${key}`));
    return;
  }
  array.forEach((item, index) => {
    const path = `$.${key}[${index}]`;
    if (!isRecord(item)) {
      issues.push(issue("UCFY_REJECTED_SCHEMA", `${key} entries must be objects`, path));
      return;
    }
    requireJsonValue(item, path, issues);
  });
}

function requireStringArray(value: Record<string, unknown>, key: string, issues: ValidationIssue[]): void {
  const array = value[key];
  if (!Array.isArray(array)) {
    issues.push(issue("UCFY_REJECTED_SCHEMA", `${key} must be an array`, `$.${key}`));
    return;
  }
  array.forEach((item, index) => {
    if (typeof item !== "string") {
      issues.push(issue("UCFY_REJECTED_SCHEMA", `${key} entries must be strings`, `$.${key}[${index}]`));
    }
  });
}

function rejectForbiddenProviderFields(value: unknown, path: string, issues: ValidationIssue[]): void {
  if (Array.isArray(value)) {
    value.forEach((item, index) => rejectForbiddenProviderFields(item, `${path}[${index}]`, issues));
    return;
  }
  if (!isRecord(value)) {
    return;
  }
  for (const [key, child] of Object.entries(value)) {
    const childPath = `${path}.${key}`;
    if (FORBIDDEN_PROVIDER_FIELDS.has(key)) {
      issues.push(issue("UCFY_REJECTED_SCHEMA", "command envelope must not contain provider-specific fields", childPath));
    }
    rejectForbiddenProviderFields(child, childPath, issues);
  }
}

function requireJsonValue(value: unknown, path: string, issues: ValidationIssue[]): void {
  if (value === null || typeof value === "string" || typeof value === "boolean") {
    return;
  }
  if (typeof value === "number") {
    if (!Number.isSafeInteger(value)) {
      issues.push(issue("UCFY_REJECTED_SCHEMA", "number must be a safe integer", path));
    }
    return;
  }
  if (Array.isArray(value)) {
    value.forEach((item, index) => requireJsonValue(item, `${path}[${index}]`, issues));
    return;
  }
  if (isRecord(value)) {
    for (const [key, child] of Object.entries(value)) {
      if (child === undefined) {
        issues.push(issue("UCFY_REJECTED_SCHEMA", "JSON values must not be undefined", `${path}.${key}`));
        continue;
      }
      requireJsonValue(child, `${path}.${key}`, issues);
    }
    return;
  }
  issues.push(issue("UCFY_REJECTED_SCHEMA", `JSON value cannot be ${typeof value}`, path));
}
