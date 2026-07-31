import type { JsonValue, OutcomeCode } from "./index.js";

export type RegistryArtifact =
  | "canonicalization_profile"
  | "checkpoint_manifest_schema"
  | "citation_domain_schema"
  | "command_schema"
  | "observation_log_schema"
  | "outcome_schema"
  | "processor_snapshot_schema"
  | "provider_snapshot_schema"
  | "reducer_version"
  | "semantic_frontier_profile"
  | "workspace_generation_schema";

export type RegistryStatus = "supported" | "reserved" | "deprecated";
export type RegistryReadMode = "supported" | "read_only" | "unsupported";
export type RegistryWriteMode = "supported" | "unsupported";
export type MigrationKind = "identity" | "m0_frontier_anchor";

export interface RegistryMigration {
  readonly from: string;
  readonly to: string;
  readonly kind: MigrationKind;
}

export interface SchemaRegistryEntry {
  readonly artifact: RegistryArtifact;
  readonly version: string;
  readonly status: RegistryStatus;
  readonly read: RegistryReadMode;
  readonly write: RegistryWriteMode;
  readonly compatibility: string;
  readonly migrations: readonly RegistryMigration[];
}

export interface SchemaRegistry {
  readonly schema_registry_version: "ucf-yjs.schema_registry.v1";
  readonly canonicalization_profile: "ucf-yjs.canonical_json.v1";
  readonly baseline: {
    readonly ucf_rs_foundation_commit: string;
    readonly ucf_yjs_m0_commit: string;
  };
  readonly entries: readonly SchemaRegistryEntry[];
}

export type RegistryValidationIssueCode =
  | "REGISTRY_DUPLICATE_ENTRY"
  | "REGISTRY_INVALID_BASELINE"
  | "REGISTRY_INVALID_ENTRY"
  | "REGISTRY_INVALID_MIGRATION"
  | "REGISTRY_MISSING_ARTIFACT"
  | "REGISTRY_OUT_OF_ORDER"
  | "REGISTRY_UNSUPPORTED_VERSION";

export interface RegistryValidationIssue {
  readonly code: RegistryValidationIssueCode;
  readonly message: string;
  readonly path: string;
}

export type RegistryValidationResult =
  | { readonly ok: true }
  | { readonly ok: false; readonly issues: readonly RegistryValidationIssue[] };

export type CompatibilityResult =
  | { readonly ok: true; readonly mode: "read_write" | "read_only" }
  | {
      readonly ok: false;
      readonly code: Extract<OutcomeCode, "UCFY_REJECTED_UNSUPPORTED_SCHEMA">;
      readonly artifact: RegistryArtifact;
      readonly version: string;
    };

export const SCHEMA_REGISTRY: SchemaRegistry = {
  schema_registry_version: "ucf-yjs.schema_registry.v1",
  canonicalization_profile: "ucf-yjs.canonical_json.v1",
  baseline: {
    ucf_rs_foundation_commit: "2b92f0cedeb987893479b39e9391d49b4f5c39c3",
    ucf_yjs_m0_commit: "52c15db5073a2e3f5eee6283c2ed79430c1d14af"
  },
  entries: [
    entry("canonicalization_profile", "ucf-yjs.canonical_json.v1", "supported", "supported", "supported", "identity"),
    entry("checkpoint_manifest_schema", "ucf-yjs.checkpoint.v1", "supported", "supported", "supported", "identity"),
    entry("citation_domain_schema", "ucf-yjs.citations.v1", "supported", "supported", "supported", "identity"),
    entry("command_schema", "ucf-yjs.command.v1", "supported", "supported", "supported", "identity"),
    entry("observation_log_schema", "ucf-yjs.observation_log.v1", "supported", "supported", "supported", "m1_observation_audit_non_semantic"),
    entry("outcome_schema", "ucf-yjs.outcome.v1", "supported", "supported", "supported", "identity"),
    entry("processor_snapshot_schema", "ucf-yjs.processor_snapshot.v1", "supported", "supported", "supported", "identity"),
    entry("provider_snapshot_schema", "ucf-yjs.local_workspace_snapshot.v1", "supported", "supported", "supported", "identity"),
    entry("reducer_version", "ucf-yjs.reducer.v1", "supported", "supported", "supported", "identity"),
    entry(
      "semantic_frontier_profile",
      "ucf-yjs.semantic_frontier.v1",
      "deprecated",
      "supported",
      "unsupported",
      "m0_outcome_chain_frontier"
    ),
    {
      artifact: "semantic_frontier_profile",
      version: "ucf-yjs.semantic_frontier.v2",
      status: "supported",
      read: "supported",
      write: "supported",
      compatibility: "m1_observations_do_not_advance_frontier",
      migrations: [
        { from: "ucf-yjs.semantic_frontier.v1", to: "ucf-yjs.semantic_frontier.v2", kind: "m0_frontier_anchor" },
        { from: "ucf-yjs.semantic_frontier.v2", to: "ucf-yjs.semantic_frontier.v2", kind: "identity" }
      ]
    },
    entry("workspace_generation_schema", "ucf-yjs.workspace_generation.v1", "supported", "supported", "supported", "identity")
  ]
} as const;

const REQUIRED_ARTIFACTS: readonly RegistryArtifact[] = [
  "canonicalization_profile",
  "checkpoint_manifest_schema",
  "citation_domain_schema",
  "command_schema",
  "observation_log_schema",
  "outcome_schema",
  "processor_snapshot_schema",
  "provider_snapshot_schema",
  "reducer_version",
  "semantic_frontier_profile",
  "workspace_generation_schema"
];

export function validateSchemaRegistry(registry: SchemaRegistry = SCHEMA_REGISTRY): RegistryValidationResult {
  const issues: RegistryValidationIssue[] = [];
  if (!isShaLike(registry.baseline.ucf_rs_foundation_commit)) {
    issues.push(issue("REGISTRY_INVALID_BASELINE", "UCF-RS baseline must be a full commit SHA", "$.baseline.ucf_rs_foundation_commit"));
  }
  if (!isShaLike(registry.baseline.ucf_yjs_m0_commit)) {
    issues.push(issue("REGISTRY_INVALID_BASELINE", "UCF-Yjs M0 baseline must be a full commit SHA", "$.baseline.ucf_yjs_m0_commit"));
  }

  const seen = new Set<string>();
  let previousKey = "";
  const artifacts = new Set<RegistryArtifact>();
  registry.entries.forEach((item, index) => {
    const path = `$.entries[${index}]`;
    const key = `${item.artifact}:${item.version}`;
    artifacts.add(item.artifact);
    if (seen.has(key)) {
      issues.push(issue("REGISTRY_DUPLICATE_ENTRY", "duplicate artifact/version entry", path));
    }
    seen.add(key);
    if (previousKey.length > 0 && key <= previousKey) {
      issues.push(issue("REGISTRY_OUT_OF_ORDER", "registry entries must be sorted by artifact and version", path));
    }
    previousKey = key;
    validateEntry(item, path, issues);
  });

  for (const artifact of REQUIRED_ARTIFACTS) {
    if (!artifacts.has(artifact)) {
      issues.push(issue("REGISTRY_MISSING_ARTIFACT", `registry is missing ${artifact}`, "$.entries"));
    }
  }

  return issues.length === 0 ? { ok: true } : { ok: false, issues };
}

export function compatibilityFor(artifact: RegistryArtifact, version: string): CompatibilityResult {
  const found = SCHEMA_REGISTRY.entries.find((item) => item.artifact === artifact && item.version === version);
  if (found === undefined || found.read === "unsupported") {
    return { ok: false, code: "UCFY_REJECTED_UNSUPPORTED_SCHEMA", artifact, version };
  }
  return { ok: true, mode: found.write === "supported" ? "read_write" : "read_only" };
}

export function migrateIdentityArtifact<T extends JsonValue>(artifact: RegistryArtifact, from: string, to: string, value: T): T {
  const found = SCHEMA_REGISTRY.entries.find((item) => item.artifact === artifact && item.version === to);
  const migration = found?.migrations.find((item) => item.from === from && item.to === to && item.kind === "identity");
  if (migration === undefined) {
    throw new Error(`unsupported schema migration: ${artifact}:${from}->${to}`);
  }
  return structuredClone(value);
}

export function migrateM0SemanticFrontierToV2<T extends JsonValue>(frontier: T): {
  readonly schema_version: "ucf-yjs.semantic_frontier_migration.v1";
  readonly from_profile: "ucf-yjs.semantic_frontier.v1";
  readonly to_profile: "ucf-yjs.semantic_frontier.v2";
  readonly m0_frontier_anchor: T;
  readonly observation_policy: "status_and_agent_view_do_not_advance";
} {
  const found = SCHEMA_REGISTRY.entries.find(
    (item) =>
      item.artifact === "semantic_frontier_profile" &&
      item.version === "ucf-yjs.semantic_frontier.v2" &&
      item.migrations.some(
        (migration) =>
          migration.from === "ucf-yjs.semantic_frontier.v1" &&
          migration.to === "ucf-yjs.semantic_frontier.v2" &&
          migration.kind === "m0_frontier_anchor"
      )
  );
  if (found === undefined) {
    throw new Error("semantic frontier v2 migration is not registered");
  }
  return {
    schema_version: "ucf-yjs.semantic_frontier_migration.v1",
    from_profile: "ucf-yjs.semantic_frontier.v1",
    to_profile: "ucf-yjs.semantic_frontier.v2",
    m0_frontier_anchor: structuredClone(frontier),
    observation_policy: "status_and_agent_view_do_not_advance"
  };
}

function entry(
  artifact: RegistryArtifact,
  version: string,
  status: RegistryStatus,
  read: RegistryReadMode,
  write: RegistryWriteMode,
  compatibility: string
): SchemaRegistryEntry {
  return {
    artifact,
    version,
    status,
    read,
    write,
    compatibility,
    migrations: [{ from: version, to: version, kind: "identity" }]
  };
}

function validateEntry(item: SchemaRegistryEntry, path: string, issues: RegistryValidationIssue[]): void {
  if (!REQUIRED_ARTIFACTS.includes(item.artifact)) {
    issues.push(issue("REGISTRY_INVALID_ENTRY", "unknown registry artifact", `${path}.artifact`));
  }
  if (!item.version.startsWith("ucf-yjs.")) {
    issues.push(issue("REGISTRY_INVALID_ENTRY", "version must use the ucf-yjs namespace", `${path}.version`));
  }
  if (item.status === "supported" && item.write !== "supported") {
    issues.push(issue("REGISTRY_INVALID_ENTRY", "supported entries must be writable by the current writer", `${path}.write`));
  }
  for (const [migrationIndex, migration] of item.migrations.entries()) {
    if (migration.kind === "identity" && (migration.from !== item.version || migration.to !== item.version)) {
      issues.push(issue("REGISTRY_INVALID_MIGRATION", "identity migration must stay within the entry version", `${path}.migrations[${migrationIndex}]`));
    }
    if (migration.kind === "m0_frontier_anchor") {
      if (item.artifact !== "semantic_frontier_profile" || migration.from !== "ucf-yjs.semantic_frontier.v1" || migration.to !== "ucf-yjs.semantic_frontier.v2") {
        issues.push(issue("REGISTRY_INVALID_MIGRATION", "m0 frontier anchor migration must target semantic frontier v2", `${path}.migrations[${migrationIndex}]`));
      }
    }
  }
}

function isShaLike(value: string): boolean {
  return /^[0-9a-f]{40}$/.test(value);
}

function issue(code: RegistryValidationIssueCode, message: string, path: string): RegistryValidationIssue {
  return { code, message, path };
}
