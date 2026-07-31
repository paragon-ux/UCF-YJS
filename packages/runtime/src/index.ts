import { spawn, type ChildProcessWithoutNullStreams } from "node:child_process";
import { open as openFile, mkdir, readFile, readdir, rename, rm } from "node:fs/promises";
import { dirname, isAbsolute, join, normalize, relative, sep } from "node:path";

import * as Y from "yjs";

import { WorkspaceProcessor, type WorkspaceProcessorSnapshot } from "../../command-processor/src/index.js";
import { canonicalJson, domainHash, type CommandEnvelope, type JsonObject } from "../../protocol/src/index.js";
import { SCHEMA_REGISTRY, compatibilityFor, migrateM0SemanticFrontierToV2, validateSchemaRegistry, type RegistryArtifact } from "../../protocol/src/schema-registry.js";
import { validateSemanticLog, type SemanticFrontier, type SemanticLogRecord } from "../../semantic-log/src/index.js";

export const runtimePackage = {
  name: "runtime",
  responsibility: "durable local named-workspace generations"
} as const;

export const WORKSPACE_GENERATION_SCHEMA_VERSION = "ucf-yjs.workspace_generation.v1";
export const CURRENT_POINTER_SCHEMA_VERSION = "ucf-yjs.workspace_current_pointer.v1";

export type GenerationPhase = "prepared" | "material_written" | "validated" | "published" | "committed";
export type RecoveryClassification = "clean" | "recovered" | "recovery_required" | "divergence";

export type GenerationComponentName =
  | "provider_state"
  | "processor_metadata"
  | "citation_state"
  | "relative_anchors"
  | "semantic_log"
  | "idempotency_state"
  | "checkpoint_manifests"
  | "retained_checkpoint_documents"
  | "schema_profile_references"
  | "migration_metadata";

export interface ComponentDescriptor {
  readonly name: GenerationComponentName;
  readonly path: string;
  readonly media_type: "application/json" | "application/octet-stream";
  readonly digest: string;
  readonly byte_length: number;
}

export interface WorkspaceGenerationManifest {
  readonly schema_version: typeof WORKSPACE_GENERATION_SCHEMA_VERSION;
  readonly workspace_id: string;
  readonly generation_id: string;
  readonly previous_generation_id: string | null;
  readonly phase: GenerationPhase;
  readonly phase_history: readonly GenerationPhase[];
  readonly phase_integrity_digest: string;
  readonly reducer_version: string;
  readonly created_at: string;
  readonly components: readonly ComponentDescriptor[];
}

export interface CurrentPointer {
  readonly schema_version: typeof CURRENT_POINTER_SCHEMA_VERSION;
  readonly workspace_id: string;
  readonly generation_id: string;
  readonly manifest_digest: string;
}

export interface DurableWorkspaceSnapshot {
  readonly generation: WorkspaceGenerationManifest;
  readonly ydoc: Y.Doc;
  readonly processor: WorkspaceProcessor;
}

export interface WorkspaceRecoveryReport {
  readonly classification: RecoveryClassification;
  readonly active_generation_id: string | null;
  readonly recovered_generation_id?: string;
  readonly diagnostics: readonly JsonObject[];
}

export type WorkspaceValidationResult =
  | { readonly ok: true; readonly workspace_id: string; readonly generation_id: string | null }
  | { readonly ok: false; readonly code: WorkspaceGenerationError["code"]; readonly diagnostics: readonly JsonObject[] };

export interface FaultInjection {
  readonly fail_after_phase?: GenerationPhase;
}

export interface WorkspaceLockOptions {
  readonly wait_ms?: number;
  readonly helper_command?: string;
  readonly helper_args?: readonly string[];
  readonly startup_timeout_ms?: number;
}

export interface WorkspaceLock {
  readonly workspace_id: string;
  readonly lock_path: string;
  release(): Promise<void>;
}

export interface PublishWorkspaceInput {
  readonly root: string;
  readonly workspace_id: string;
  readonly processor: WorkspaceProcessor;
  readonly ydoc?: Y.Doc;
  readonly created_at?: string;
  readonly fault_injection?: FaultInjection;
  readonly migration_metadata?: WorkspaceMigrationMetadata;
}

export interface DurableCommandInput {
  readonly root: string;
  readonly workspace_id: string;
  readonly command: CommandEnvelope;
  readonly capability?: {
    readonly actor_id: string;
    readonly can_read_content: boolean;
    readonly can_write: boolean;
    readonly can_accept: boolean;
    readonly max_agent_items?: number;
  };
}

export interface DurableCommandResult {
  readonly result: ReturnType<WorkspaceProcessor["submit"]>;
  readonly generation_published: boolean;
  readonly generation_id: string | null;
}

export type ProviderImportResult =
  | {
      readonly ok: true;
      readonly classification: "identical_existing" | "empty_noop";
      readonly generation_id: string | null;
      readonly import_id: string;
      readonly diagnostics: readonly JsonObject[];
    }
  | {
      readonly ok: false;
      readonly code: "UCFY_RECOVERY_REQUIRED" | "UCFY_CORRUPT_GENERATION";
      readonly classification: "unclassified_provider_state";
      readonly generation_id: string | null;
      readonly import_id: string;
      readonly diagnostics: readonly JsonObject[];
    };

export interface WorkspaceMigrationMetadata {
  readonly schema_version: "ucf-yjs.workspace_migration.v1";
  readonly kind: "native" | "m0_local_workspace";
  readonly actor_id: string | null;
  readonly source_schema_version: string | null;
  readonly target_schema_version: typeof WORKSPACE_GENERATION_SCHEMA_VERSION;
  readonly source_digest: string | null;
  readonly semantic_frontier_migration:
    | null
    | {
        readonly schema_version: "ucf-yjs.semantic_frontier_migration.v1";
        readonly from_profile: "ucf-yjs.semantic_frontier.v1";
        readonly to_profile: "ucf-yjs.semantic_frontier.v2";
        readonly m0_frontier_anchor: SemanticFrontier;
        readonly observation_policy: "status_and_agent_view_do_not_advance";
      };
  readonly live_version_transition:
    | null
    | {
        readonly from_profile: "ucf-yjs.semantic_frontier.v1";
        readonly to_profile: "ucf-yjs.semantic_frontier.v2";
        readonly policy: "preserve_m0_outcome_live_versions_and_use_v2_for_future_identity";
      };
}

export type M0LocalWorkspaceMigrationResult =
  | {
      readonly ok: true;
      readonly classification: "migrated" | "already_migrated";
      readonly workspace_id: string;
      readonly generation_id: string;
      readonly migration_id: string;
      readonly source_digest: string;
      readonly actor_id: string;
      readonly m0_frontier_anchor: SemanticFrontier;
      readonly diagnostics: readonly JsonObject[];
    }
  | {
      readonly ok: false;
      readonly code: "UCFY_REJECTED_UNSUPPORTED_SCHEMA" | "UCFY_CORRUPT_GENERATION" | "UCFY_RECOVERY_REQUIRED";
      readonly classification: "unsupported_m0_workspace" | "corrupt_m0_workspace" | "recovery_required";
      readonly workspace_id: string;
      readonly source_digest: string | null;
      readonly actor_id: string;
      readonly diagnostics: readonly JsonObject[];
    };

interface ComponentMaterial {
  readonly descriptor: ComponentDescriptor;
  readonly bytes: Uint8Array;
}

interface PendingGeneration {
  readonly path: string;
  readonly manifest: WorkspaceGenerationManifest;
}

type CurrentPointerStatus =
  | { readonly kind: "absent" }
  | { readonly kind: "valid"; readonly pointer: CurrentPointer; readonly manifest: WorkspaceGenerationManifest; readonly generation_path: string }
  | {
      readonly kind: "malformed" | "unsupported" | "workspace_mismatch" | "missing_generation" | "generation_mismatch";
      readonly code: WorkspaceGenerationError["code"];
      readonly diagnostics: readonly JsonObject[];
    };

interface SchemaProfileReferences {
  readonly schema_version: "ucf-yjs.schema_profile_references.v1";
  readonly schema_registry_version: typeof SCHEMA_REGISTRY.schema_registry_version;
  readonly canonicalization_profile: typeof SCHEMA_REGISTRY.canonicalization_profile;
  readonly entries: readonly {
    readonly artifact: (typeof SCHEMA_REGISTRY.entries)[number]["artifact"];
    readonly version: string;
  }[];
}

export class WorkspaceGenerationError extends Error {
  constructor(
    readonly code:
      | "UCFY_RECOVERY_REQUIRED"
      | "UCFY_DIVERGENCE"
      | "UCFY_REJECTED_UNSUPPORTED_SCHEMA"
      | "UCFY_CORRUPT_GENERATION",
    message: string,
    readonly diagnostics: readonly JsonObject[] = []
  ) {
    super(message);
  }
}

export class WorkspaceLockError extends Error {
  constructor(
    readonly code: "UCFY_LOCK_BUSY" | "UCFY_LOCK_FAILED",
    message: string,
    readonly diagnostics: readonly JsonObject[] = []
  ) {
    super(message);
  }
}

export async function acquireWorkspaceLock(root: string, workspace_id: string, options: WorkspaceLockOptions = {}): Promise<WorkspaceLock> {
  const workspacePath = workspaceStorePath(root, workspace_id);
  await mkdir(workspacePath, { recursive: true });
  const lock_path = join(workspacePath, "writer.lock");
  const waitMs = options.wait_ms ?? 0;
  const helper = options.helper_command ?? process.env.UCF_YJS_LOCK_PYTHON ?? (process.platform === "win32" ? "python" : "python3");
  const child = spawn(helper, [...(options.helper_args ?? []), "-c", PYTHON_LOCK_HELPER, lock_path, String(waitMs)], {
    stdio: ["pipe", "pipe", "pipe"],
    windowsHide: true
  });
  const ready = await waitForLockHelper(child, lock_path, options.startup_timeout_ms ?? 5000);
  if (!ready.ok) {
    throw new WorkspaceLockError(ready.code, ready.message, ready.diagnostics);
  }
  let released = false;
  return {
    workspace_id,
    lock_path,
    release: async () => {
      if (released) {
        return;
      }
      released = true;
      await releaseLockHelper(child);
    }
  };
}

export async function withWorkspaceLock<T>(
  root: string,
  workspace_id: string,
  callback: () => Promise<T>,
  options: WorkspaceLockOptions = {}
): Promise<T> {
  const lock = await acquireWorkspaceLock(root, workspace_id, options);
  try {
    return await callback();
  } finally {
    await lock.release();
  }
}

export async function publishWorkspaceGeneration(input: PublishWorkspaceInput): Promise<WorkspaceGenerationManifest> {
  return withWorkspaceLock(input.root, input.workspace_id, async () => {
    const workspacePath = workspaceStorePath(input.root, input.workspace_id);
    const plan = await planWorkspaceRecovery(workspacePath, input.workspace_id);
    if (plan.classification !== "clean") {
      throw new WorkspaceGenerationError(
        plan.classification === "divergence" ? "UCFY_DIVERGENCE" : "UCFY_RECOVERY_REQUIRED",
        "workspace must be clean before direct publication",
        plan.diagnostics
      );
    }
    return publishWorkspaceGenerationLocked(input);
  });
}

async function publishWorkspaceGenerationLocked(input: PublishWorkspaceInput): Promise<WorkspaceGenerationManifest> {
  const workspacePath = workspaceStorePath(input.root, input.workspace_id);
  await mkdir(generationsPath(workspacePath), { recursive: true });
  const previous = await requireReadablePointer(workspacePath, input.workspace_id);
  const snapshot = input.processor.snapshot();
  const providerState = input.ydoc === undefined ? new Uint8Array() : Y.encodeStateAsUpdate(input.ydoc);
  const material = buildMaterial(providerState, snapshot, input.migration_metadata ?? nativeMigrationMetadata());
  const generation_id = generationIdentity(input.workspace_id, previous?.pointer.generation_id ?? null, material);
  const generationPath = generationDirectoryPath(workspacePath, generation_id);
  await mkdir(join(generationPath, "components"), { recursive: true });

  const prepared: Omit<WorkspaceGenerationManifest, "phase_integrity_digest"> = {
    schema_version: WORKSPACE_GENERATION_SCHEMA_VERSION,
    workspace_id: input.workspace_id,
    generation_id,
    previous_generation_id: previous?.pointer.generation_id ?? null,
    phase: "prepared",
    phase_history: ["prepared"],
    reducer_version: snapshot.reducer_version,
    created_at: input.created_at ?? "1970-01-01T00:00:00.000Z",
    components: material.map((item) => item.descriptor)
  };
  let manifest = withPhaseIntegrity(prepared);
  await writeJsonDurable(join(generationPath, "manifest.json"), manifest);
  maybeFail(input.fault_injection, "prepared");

  for (const component of material) {
    await writeBytesDurable(join(generationPath, component.descriptor.path), component.bytes);
  }
  manifest = await advancePhase(generationPath, manifest, "material_written", input.fault_injection);

  await validateGeneration(generationPath, manifest);
  manifest = await advancePhase(generationPath, manifest, "validated", input.fault_injection);

  await writeCurrentPointer(workspacePath, input.workspace_id, manifest);
  manifest = await advancePhase(generationPath, manifest, "published");
  await writeCurrentPointer(workspacePath, input.workspace_id, manifest);
  maybeFail(input.fault_injection, "published");
  manifest = await advancePhase(generationPath, manifest, "committed");
  await writeCurrentPointer(workspacePath, input.workspace_id, manifest);
  maybeFail(input.fault_injection, "committed");
  return manifest;
}

export async function initializeWorkspace(root: string, workspace_id: string): Promise<WorkspaceGenerationManifest> {
  return withWorkspaceLock(root, workspace_id, async () => {
    const existing = await openDurableWorkspace(root, workspace_id);
    if (existing !== null) {
      return existing.generation;
    }
    const ydoc = new Y.Doc();
    const processor = new WorkspaceProcessor(workspace_id, "ucf-yjs.reducer.v1", { ydoc });
    return publishWorkspaceGenerationLocked({ root, workspace_id, processor, ydoc });
  });
}

export async function submitDurableCommand(input: DurableCommandInput): Promise<DurableCommandResult> {
  return withWorkspaceLock(input.root, input.workspace_id, async () => {
    const workspacePath = workspaceStorePath(input.root, input.workspace_id);
    if (blocksOnUnclassifiedImport(input.command.operation) && await hasUnclassifiedImports(workspacePath)) {
      throw new WorkspaceGenerationError("UCFY_RECOVERY_REQUIRED", "unclassified provider state requires semantic reconciliation", [
        { reason: "unclassified_provider_state_blocks_acceptance", operation: input.command.operation }
      ]);
    }
    const opened = await openDurableWorkspace(input.root, input.workspace_id);
    const ydoc = opened?.ydoc ?? new Y.Doc();
    const processor = opened?.processor ?? new WorkspaceProcessor(input.workspace_id, "ucf-yjs.reducer.v1", { ydoc });
    const before = canonicalJson(processor.semanticLog.snapshot() as unknown as JsonObject);
    const result = processor.submit(input.command, input.capability ?? runtimeValidationCapability());
    const after = canonicalJson(processor.semanticLog.snapshot() as unknown as JsonObject);
    if (before === after) {
      return { result, generation_published: false, generation_id: opened?.generation.generation_id ?? null };
    }
    const generation = await publishWorkspaceGenerationLocked({ root: input.root, workspace_id: input.workspace_id, processor, ydoc });
    return { result, generation_published: true, generation_id: generation.generation_id };
  });
}

export async function exportProviderState(root: string, workspace_id: string): Promise<Uint8Array> {
  const opened = await openDurableWorkspace(root, workspace_id);
  if (opened === null) {
    return new Uint8Array();
  }
  return Y.encodeStateAsUpdate(opened.ydoc);
}

export async function importProviderState(root: string, workspace_id: string, providerState: Uint8Array): Promise<ProviderImportResult> {
  return withWorkspaceLock(root, workspace_id, async () => {
    const opened = await openDurableWorkspace(root, workspace_id);
    const import_id = domainHash("ucf-yjs.provider_import.v1", { bytes_base64: Buffer.from(providerState).toString("base64") });
    if (providerState.byteLength === 0 && opened === null) {
      return { ok: true, classification: "empty_noop", generation_id: null, import_id, diagnostics: [] };
    }
    const ydoc = new Y.Doc();
    if (providerState.byteLength > 0) {
      Y.applyUpdate(ydoc, providerState);
    }
    if (opened !== null && canonicalJson(documentsFromYDoc(ydoc) as unknown as JsonObject) === canonicalJson(documentsFromYDoc(opened.ydoc) as unknown as JsonObject)) {
      return { ok: true, classification: "identical_existing", generation_id: opened.generation.generation_id, import_id, diagnostics: [] };
    }
    await retainUnclassifiedImport(root, workspace_id, import_id, providerState);
    return {
      ok: false,
      code: "UCFY_RECOVERY_REQUIRED",
      classification: "unclassified_provider_state",
      generation_id: opened?.generation.generation_id ?? null,
      import_id,
      diagnostics: [{ reason: "raw_provider_import_requires_reconciliation" }]
    };
  });
}

export async function migrateM0LocalWorkspace(
  root: string,
  workspace_id: string,
  source_path: string,
  options: { readonly actor_id: string; readonly created_at?: string; readonly fault_injection?: FaultInjection }
): Promise<M0LocalWorkspaceMigrationResult> {
  return withWorkspaceLock(root, workspace_id, async () => {
    let sourceBytes: Uint8Array;
    try {
      sourceBytes = new Uint8Array(await readFile(source_path));
    } catch (error) {
      return {
        ok: false,
        code: "UCFY_CORRUPT_GENERATION",
        classification: "corrupt_m0_workspace",
        workspace_id,
        source_digest: null,
        actor_id: options.actor_id,
        diagnostics: [{ reason: "m0_source_unreadable", detail: redactedError(error) }]
      };
    }
    const source_digest = domainHash("ucf-yjs.m0_local_workspace.source.v1", {
      bytes_base64: Buffer.from(sourceBytes).toString("base64")
    });
    const parsed = parseM0LocalWorkspaceSnapshot(sourceBytes);
    if (!parsed.ok) {
      return {
        ok: false,
        code: parsed.code,
        classification: parsed.classification,
        workspace_id,
        source_digest,
        actor_id: options.actor_id,
        diagnostics: parsed.diagnostics
      };
    }
    if (parsed.snapshot.authority.workspace_id !== workspace_id) {
      return {
        ok: false,
        code: "UCFY_CORRUPT_GENERATION",
        classification: "corrupt_m0_workspace",
        workspace_id,
        source_digest,
        actor_id: options.actor_id,
        diagnostics: [{ reason: "m0_workspace_id_mismatch", source_workspace_id: parsed.snapshot.authority.workspace_id }]
      };
    }
    const workspacePath = workspaceStorePath(root, workspace_id);
    const plan = await planWorkspaceRecovery(workspacePath, workspace_id);
    if (plan.classification !== "clean") {
      return {
        ok: false,
        code: plan.classification === "divergence" ? "UCFY_CORRUPT_GENERATION" : "UCFY_RECOVERY_REQUIRED",
        classification: "recovery_required",
        workspace_id,
        source_digest,
        actor_id: options.actor_id,
        diagnostics: plan.diagnostics
      };
    }
    const current = await openDurableWorkspace(root, workspace_id);
    const lineageMigration = await findM0MigrationForSource(workspacePath, source_digest);
    const existingMigration =
      current === null
        ? null
        : await readGenerationMigrationMetadata(generationDirectoryPath(workspacePath, current.generation.generation_id), current.generation);
    const matchingMigration = existingMigration?.kind === "m0_local_workspace" && existingMigration.source_digest === source_digest ? existingMigration : lineageMigration?.metadata;
    if (matchingMigration?.kind === "m0_local_workspace" && matchingMigration.source_digest === source_digest) {
      return {
        ok: true,
        classification: "already_migrated",
        workspace_id,
        generation_id: current?.generation.generation_id ?? lineageMigration!.manifest.generation_id,
        migration_id: migrationId(workspace_id, source_digest),
        source_digest,
        actor_id: options.actor_id,
        m0_frontier_anchor: matchingMigration.semantic_frontier_migration!.m0_frontier_anchor,
        diagnostics: []
      };
    }
    if (current !== null) {
      return {
        ok: false,
        code: "UCFY_RECOVERY_REQUIRED",
        classification: "recovery_required",
        workspace_id,
        source_digest,
        actor_id: options.actor_id,
        diagnostics: [{ reason: "m0_migration_target_already_initialized", generation_id: current.generation.generation_id }]
      };
    }

    const ydoc = new Y.Doc();
    if (parsed.snapshot.provider_state.byteLength > 0) {
      Y.applyUpdate(ydoc, parsed.snapshot.provider_state);
    }
    const processor = WorkspaceProcessor.fromSnapshot(parsed.snapshot.authority, ydoc);
    const validation = validateSemanticLog(parsed.snapshot.authority.semantic_log);
    if (!validation.ok) {
      return {
        ok: false,
        code: "UCFY_CORRUPT_GENERATION",
        classification: "corrupt_m0_workspace",
        workspace_id,
        source_digest,
        actor_id: options.actor_id,
        diagnostics: [{ reason: "m0_semantic_log_invalid", issues: validation.issues.map((issue) => ({ code: issue.code, index: issue.index })) }]
      };
    }
    const migration_metadata: WorkspaceMigrationMetadata = {
      schema_version: "ucf-yjs.workspace_migration.v1",
      kind: "m0_local_workspace",
      actor_id: options.actor_id,
      source_schema_version: "ucf-yjs.local_workspace_snapshot.v1",
      target_schema_version: WORKSPACE_GENERATION_SCHEMA_VERSION,
      source_digest,
      semantic_frontier_migration: migrateM0SemanticFrontierToV2(validation.frontier as unknown as JsonObject) as unknown as WorkspaceMigrationMetadata["semantic_frontier_migration"],
      live_version_transition: {
        from_profile: "ucf-yjs.semantic_frontier.v1",
        to_profile: "ucf-yjs.semantic_frontier.v2",
        policy: "preserve_m0_outcome_live_versions_and_use_v2_for_future_identity"
      }
    };
    await retainM0MigrationSource(root, workspace_id, migrationId(workspace_id, source_digest), sourceBytes);
    const publishInput: PublishWorkspaceInput = {
      root,
      workspace_id,
      processor,
      ydoc,
      migration_metadata
    };
    if (options.created_at !== undefined) {
      (publishInput as { created_at?: string }).created_at = options.created_at;
    }
    if (options.fault_injection !== undefined) {
      (publishInput as { fault_injection?: FaultInjection }).fault_injection = options.fault_injection;
    }
    const generation = await publishWorkspaceGenerationLocked(publishInput);
    return {
      ok: true,
      classification: "migrated",
      workspace_id,
      generation_id: generation.generation_id,
      migration_id: migrationId(workspace_id, source_digest),
      source_digest,
      actor_id: options.actor_id,
      m0_frontier_anchor: validation.frontier,
      diagnostics: []
    };
  });
}

export async function resolveWorkspaceRecovery(root: string, workspace_id: string): Promise<WorkspaceRecoveryReport> {
  return withWorkspaceLock(root, workspace_id, async () => executeWorkspaceRecoveryLocked(root, workspace_id));
}

export async function recoverWorkspaceGeneration(root: string, workspace_id: string): Promise<WorkspaceRecoveryReport> {
  return inspectWorkspaceGeneration(root, workspace_id);
}

async function executeWorkspaceRecoveryLocked(root: string, workspace_id: string): Promise<WorkspaceRecoveryReport> {
  const workspacePath = workspaceStorePath(root, workspace_id);
  const plan = await planWorkspaceRecovery(workspacePath, workspace_id);
  if (plan.classification === "clean") {
    const pruned = await prunePreparedGenerations(workspacePath);
    return pruned === 0
      ? plan
      : {
          ...plan,
          diagnostics: [...plan.diagnostics, { reason: "prepared_generations_pruned", count: pruned }]
        };
  }
  if (plan.classification !== "recovery_required" || plan.recovered_generation_id === undefined) {
    return plan;
  }
  const newest = await readGenerationCandidate(workspacePath, plan.recovered_generation_id);
  try {
    await validateGeneration(newest.path, newest.manifest);
  } catch (error) {
    if (error instanceof WorkspaceGenerationError && error.code === "UCFY_DIVERGENCE") {
      return { classification: "divergence", active_generation_id: plan.active_generation_id, diagnostics: error.diagnostics };
    }
    return {
      classification: "recovery_required",
      active_generation_id: plan.active_generation_id,
      diagnostics: [{ reason: "pending_generation_incomplete_or_invalid", detail: redactedError(error) }]
    };
  }
  let manifest = newest.manifest;
  if (manifest.phase === "material_written") {
    manifest = await advancePhase(newest.path, manifest, "validated");
  }
  if (manifest.phase !== "published") {
    manifest = await advancePhase(newest.path, manifest, "published");
  }
  manifest = await advancePhase(newest.path, manifest, "committed");
  await writeCurrentPointer(workspacePath, workspace_id, manifest);
  return {
    classification: "recovered",
    active_generation_id: manifest.generation_id,
    recovered_generation_id: manifest.generation_id,
    diagnostics: []
  };
}

export async function openDurableWorkspace(root: string, workspace_id: string): Promise<DurableWorkspaceSnapshot | null> {
  const workspacePath = workspaceStorePath(root, workspace_id);
  const recovery = await planWorkspaceRecovery(workspacePath, workspace_id);
  if (recovery.classification !== "clean") {
    throw new WorkspaceGenerationError(
      recovery.classification === "divergence" ? "UCFY_DIVERGENCE" : "UCFY_RECOVERY_REQUIRED",
      `workspace ${workspace_id} requires operator attention`,
      recovery.diagnostics
    );
  }
  const current = await readCurrentPointerStatus(workspacePath, workspace_id);
  if (current.kind === "absent") {
    return null;
  }
  if (current.kind !== "valid") {
    throw new WorkspaceGenerationError(current.code, "current pointer is not usable", current.diagnostics);
  }
  await validateGeneration(current.generation_path, current.manifest);
  const processorSnapshot = await readJson<WorkspaceProcessorSnapshot>(join(current.generation_path, "components", "processor.json"));
  const providerState = await readFile(join(current.generation_path, "components", "provider.bin"));
  const ydoc = new Y.Doc();
  if (providerState.byteLength > 0) {
    Y.applyUpdate(ydoc, new Uint8Array(providerState));
  }
  return {
    generation: current.manifest,
    ydoc,
    processor: WorkspaceProcessor.fromSnapshot(processorSnapshot, ydoc)
  };
}

export async function inspectWorkspaceGeneration(root: string, workspace_id: string): Promise<WorkspaceRecoveryReport> {
  return planWorkspaceRecovery(workspaceStorePath(root, workspace_id), workspace_id);
}

export async function validateDurableWorkspace(root: string, workspace_id: string): Promise<WorkspaceValidationResult> {
  try {
    const workspacePath = workspaceStorePath(root, workspace_id);
    const current = await readCurrentPointerStatus(workspacePath, workspace_id);
    if (current.kind === "absent") {
      return { ok: true, workspace_id, generation_id: null };
    }
    if (current.kind !== "valid") {
      throw new WorkspaceGenerationError(current.code, "current pointer is not usable", current.diagnostics);
    }
    await validateGeneration(current.generation_path, current.manifest);
    return { ok: true, workspace_id, generation_id: current.manifest.generation_id };
  } catch (error) {
    if (error instanceof WorkspaceGenerationError) {
      return { ok: false, code: error.code, diagnostics: redactDiagnostics(error.diagnostics) };
    }
    return {
      ok: false,
      code: "UCFY_CORRUPT_GENERATION",
      diagnostics: [{ reason: "workspace_validation_failed", detail: redactedError(error) }]
    };
  }
}

export function workspaceStorePath(root: string, workspace_id: string): string {
  return join(root, ".ucf-yjs", "workspaces", pathSegmentForWorkspaceId(workspace_id));
}

async function writeCurrentPointer(workspacePath: string, workspace_id: string, manifest: WorkspaceGenerationManifest): Promise<void> {
  const pointer: CurrentPointer = {
    schema_version: CURRENT_POINTER_SCHEMA_VERSION,
    workspace_id,
    generation_id: manifest.generation_id,
    manifest_digest: manifestDigest(manifest)
  };
  await writeJsonDurable(join(workspacePath, "current.json"), pointer);
  await syncDirectory(workspacePath);
}

function generationsPath(workspacePath: string): string {
  return join(workspacePath, "generations");
}

function generationDirectoryPath(workspacePath: string, generationId: string): string {
  return join(generationsPath(workspacePath), pathSegmentForGenerationId(generationId));
}

function buildMaterial(providerState: Uint8Array, snapshot: WorkspaceProcessorSnapshot, migrationMetadata: WorkspaceMigrationMetadata): readonly ComponentMaterial[] {
  const semanticLog = snapshot.semantic_log;
  const idempotency = semanticLog.filter((record) => record.record_type === "idempotency");
  const components: readonly [GenerationComponentName, string, Uint8Array, "application/json" | "application/octet-stream"][] = [
    ["provider_state", "components/provider.bin", providerState, "application/octet-stream"],
    ["processor_metadata", "components/processor.json", jsonBytes(snapshot), "application/json"],
    ["citation_state", "components/citations.json", jsonBytes(snapshot.citations), "application/json"],
    ["relative_anchors", "components/anchors.json", jsonBytes(snapshot.anchors), "application/json"],
    ["semantic_log", "components/semantic-log.json", jsonBytes(semanticLog), "application/json"],
    ["idempotency_state", "components/idempotency.json", jsonBytes(idempotency), "application/json"],
    ["checkpoint_manifests", "components/checkpoints.json", jsonBytes(snapshot.checkpoints), "application/json"],
    ["retained_checkpoint_documents", "components/checkpoint-documents.json", jsonBytes(snapshot.checkpoint_documents), "application/json"],
    ["schema_profile_references", "components/schemas.json", jsonBytes(schemaProfileReferences()), "application/json"],
    ["migration_metadata", "components/migration.json", jsonBytes(migrationMetadata), "application/json"]
  ];
  return components.map(([name, path, bytes, media_type]) => ({
    bytes,
    descriptor: {
      name,
      path,
      media_type,
      digest: componentDigest(name, bytes),
      byte_length: bytes.byteLength
    }
  }));
}

async function validateGeneration(generationPath: string, manifest: WorkspaceGenerationManifest): Promise<void> {
  if (manifest.schema_version !== WORKSPACE_GENERATION_SCHEMA_VERSION) {
    throw new WorkspaceGenerationError("UCFY_REJECTED_UNSUPPORTED_SCHEMA", "unsupported workspace generation schema", [
      { schema_version: manifest.schema_version }
    ]);
  }
  validateWorkspaceId(manifest.workspace_id);
  validateGenerationId(manifest.generation_id);
  if (manifest.previous_generation_id !== null) {
    validateGenerationId(manifest.previous_generation_id);
  }
  validatePhaseProtocol(manifest);
  if (!validateSchemaRegistry(SCHEMA_REGISTRY).ok) {
    throw new WorkspaceGenerationError("UCFY_REJECTED_UNSUPPORTED_SCHEMA", "invalid schema registry");
  }
  validateComponentDescriptors(generationPath, manifest.components);
  for (const component of manifest.components) {
    const bytes = await readFile(componentAbsolutePath(generationPath, component)).catch((error: unknown) => {
      throw new WorkspaceGenerationError("UCFY_CORRUPT_GENERATION", "generation component missing", [
        { component: component.name, detail: redactedError(error) }
      ]);
    });
    const actualDigest = componentDigest(component.name, new Uint8Array(bytes));
    if (actualDigest !== component.digest || bytes.byteLength !== component.byte_length) {
      throw new WorkspaceGenerationError("UCFY_DIVERGENCE", "generation component digest mismatch", [
        { component: component.name, reason: "component_digest_mismatch" }
      ]);
    }
  }
  const semanticLog = await readJson<readonly SemanticLogRecord[]>(join(generationPath, "components", "semantic-log.json"));
  const validation = validateSemanticLog(semanticLog);
  if (!validation.ok) {
    throw new WorkspaceGenerationError("UCFY_CORRUPT_GENERATION", "semantic log validation failed", [
      { issues: validation.issues.map((issue) => ({ code: issue.code, index: issue.index })) }
    ]);
  }
  const snapshot = await readJson<WorkspaceProcessorSnapshot>(join(generationPath, "components", "processor.json"));
  if (snapshot.schema_version !== "ucf-yjs.processor_snapshot.v1") {
    throw new WorkspaceGenerationError("UCFY_REJECTED_UNSUPPORTED_SCHEMA", "unsupported processor snapshot schema", [
      { schema_version: snapshot.schema_version }
    ]);
  }
  if (snapshot.workspace_id !== manifest.workspace_id || snapshot.reducer_version !== manifest.reducer_version) {
    throw new WorkspaceGenerationError("UCFY_CORRUPT_GENERATION", "processor snapshot does not match generation manifest", [
      { reason: "processor_manifest_mismatch" }
    ]);
  }
  const citations = await readJson<unknown>(join(generationPath, "components", "citations.json"));
  const anchors = await readJson<unknown>(join(generationPath, "components", "anchors.json"));
  const idempotency = await readJson<unknown>(join(generationPath, "components", "idempotency.json"));
  const checkpoints = await readJson<unknown>(join(generationPath, "components", "checkpoints.json"));
  const checkpointDocuments = await readJson<unknown>(join(generationPath, "components", "checkpoint-documents.json"));
  const schemaProfileReferences = await readJson<unknown>(join(generationPath, "components", "schemas.json"));
  const migrationMetadata = await readJson<unknown>(join(generationPath, "components", "migration.json"));
  const expectedIdempotency = snapshot.semantic_log.filter((record) => record.record_type === "idempotency");
  assertCrossPlaneEqual("citation_state", citations, snapshot.citations);
  assertCrossPlaneEqual("relative_anchors", anchors, snapshot.anchors);
  assertCrossPlaneEqual("semantic_log", semanticLog, snapshot.semantic_log);
  assertCrossPlaneEqual("idempotency_state", idempotency, expectedIdempotency);
  assertCrossPlaneEqual("checkpoint_manifests", checkpoints, snapshot.checkpoints);
  assertCrossPlaneEqual("retained_checkpoint_documents", checkpointDocuments, snapshot.checkpoint_documents);
  validateSchemaProfileReferences(schemaProfileReferences);
  const migration = validateMigrationMetadata(migrationMetadata, validation.frontier);
  await validateRetainedM0Source(generationPath, manifest.workspace_id, migration);
  try {
    const providerState = await readFile(join(generationPath, "components", "provider.bin"));
    const ydoc = new Y.Doc();
    if (providerState.byteLength > 0) {
      Y.applyUpdate(ydoc, new Uint8Array(providerState));
    }
    const processor = WorkspaceProcessor.fromSnapshot(snapshot, ydoc);
    const lastLiveVersion = [...semanticLog]
      .reverse()
      .find((record) => record.record_type === "outcome" && typeof record.outcome.new_live_version === "string");
    if (lastLiveVersion?.record_type === "outcome") {
      const rebuilt = processor.projections(runtimeValidationCapability()).workspace_status.live_version;
      if (rebuilt !== lastLiveVersion.outcome.new_live_version && !allowsM0LiveVersionTransition(migration, validation.frontier)) {
        throw new WorkspaceGenerationError("UCFY_CORRUPT_GENERATION", "deterministic projection rebuild mismatch", [
          { reason: "projection_rebuild_mismatch" }
        ]);
      }
    }
  } catch (error) {
    if (error instanceof WorkspaceGenerationError) {
      throw error;
    }
    throw new WorkspaceGenerationError("UCFY_CORRUPT_GENERATION", "processor snapshot validation failed", [
      { detail: redactedError(error) }
    ]);
  }
}

async function advancePhase(
  generationPath: string,
  manifest: WorkspaceGenerationManifest,
  phase: GenerationPhase,
  faultInjection?: FaultInjection
): Promise<WorkspaceGenerationManifest> {
  const advanced = withPhaseIntegrity({
    ...manifest,
    phase,
    phase_history: [...manifest.phase_history, phase]
  });
  await writeJsonDurable(join(generationPath, "manifest.json"), advanced);
  maybeFail(faultInjection, phase);
  return advanced;
}

function maybeFail(faultInjection: FaultInjection | undefined, phase: GenerationPhase): void {
  if (faultInjection?.fail_after_phase === phase) {
    throw new WorkspaceGenerationError("UCFY_RECOVERY_REQUIRED", `fault injection after generation phase ${phase}`, [{ phase }]);
  }
}

function assertCrossPlaneEqual(component: GenerationComponentName, actual: unknown, expected: unknown): void {
  if (canonicalJson(actual as JsonObject) !== canonicalJson(expected as JsonObject)) {
    throw new WorkspaceGenerationError("UCFY_CORRUPT_GENERATION", "generation component disagrees with processor snapshot", [
      { component, reason: "cross_plane_mismatch" }
    ]);
  }
}

function runtimeValidationCapability() {
  return { actor_id: "runtime-validator", can_read_content: true, can_write: true, can_accept: true };
}

async function pendingGenerations(workspacePath: string): Promise<readonly PendingGeneration[]> {
  const root = generationsPath(workspacePath);
  const entries = await readdir(root, { withFileTypes: true }).catch(() => []);
  const pending: PendingGeneration[] = [];
  for (const entry of entries) {
    if (!entry.isDirectory()) {
      continue;
    }
    const path = join(root, entry.name);
    const manifest = await readManifestFile(join(path, "manifest.json")).catch(() => null);
    if (manifest !== null) {
      pending.push({ path, manifest });
    }
  }
  return pending;
}

async function prunePreparedGenerations(workspacePath: string): Promise<number> {
  const prepared = (await pendingGenerations(workspacePath)).filter((item) => item.manifest.phase === "prepared");
  for (const item of prepared) {
    await rm(item.path, { recursive: true, force: true });
  }
  return prepared.length;
}

async function planWorkspaceRecovery(workspacePath: string, workspace_id: string): Promise<WorkspaceRecoveryReport> {
  const current = await readCurrentPointerStatus(workspacePath, workspace_id);
  if (current.kind !== "absent" && current.kind !== "valid") {
    return {
      classification: current.code === "UCFY_REJECTED_UNSUPPORTED_SCHEMA" ? "recovery_required" : "divergence",
      active_generation_id: null,
      diagnostics: current.diagnostics
    };
  }
  const active_generation_id =
    current.kind === "valid"
      ? current.manifest.phase === "committed"
        ? current.manifest.generation_id
        : current.manifest.previous_generation_id
      : null;
  if (active_generation_id !== null) {
    const parent = await readGenerationManifest(workspacePath, active_generation_id).catch(() => null);
    if (parent === null || parent.phase !== "committed") {
      return {
        classification: "divergence",
        active_generation_id,
        diagnostics: [{ reason: "pending_generation_parent_missing_or_uncommitted", generation_id: active_generation_id }]
      };
    }
  }
  const candidates = (await pendingGenerations(workspacePath)).filter((item) => item.manifest.phase !== "committed");
  const recoverable = candidates.filter(
    (item) => item.manifest.phase !== "prepared" && item.manifest.previous_generation_id === active_generation_id
  );
  const stale = candidates.filter(
    (item) => item.manifest.phase !== "prepared" && item.manifest.previous_generation_id !== active_generation_id
  );
  if (stale.length > 0) {
    return {
      classification: "divergence",
      active_generation_id,
      diagnostics: stale.map((item) => ({
        reason: "pending_generation_parent_mismatch",
        generation_id: item.manifest.generation_id,
        previous_generation_id: item.manifest.previous_generation_id
      }))
    };
  }
  if (recoverable.length === 0) {
    return {
      classification: "clean",
      active_generation_id,
      diagnostics: candidates.length === 0 ? [] : [{ reason: "prepared_generation_has_not_reached_material_write" }]
    };
  }
  if (recoverable.length > 1) {
    return {
      classification: "divergence",
      active_generation_id,
      diagnostics: recoverable.map((item) => ({ reason: "multiple_pending_sibling_generations", generation_id: item.manifest.generation_id }))
    };
  }
  const candidate = recoverable[0]!;
  try {
    await validateGeneration(candidate.path, candidate.manifest);
  } catch (error) {
    if (error instanceof WorkspaceGenerationError && error.code === "UCFY_DIVERGENCE") {
      return { classification: "divergence", active_generation_id, diagnostics: error.diagnostics };
    }
    return {
      classification: "recovery_required",
      active_generation_id,
      recovered_generation_id: candidate.manifest.generation_id,
      diagnostics: [{ reason: "pending_generation_incomplete_or_invalid", detail: redactedError(error) }]
    };
  }
  return {
    classification: "recovery_required",
    active_generation_id,
    recovered_generation_id: candidate.manifest.generation_id,
    diagnostics: [{ reason: "pending_generation_ready_for_locked_recovery" }]
  };
}

async function readGenerationCandidate(workspacePath: string, generationId: string): Promise<PendingGeneration> {
  validateGenerationId(generationId);
  const path = generationDirectoryPath(workspacePath, generationId);
  return { path, manifest: await readManifestFile(join(path, "manifest.json")) };
}

async function readGenerationManifest(workspacePath: string, generationId: string): Promise<WorkspaceGenerationManifest> {
  return readManifestFile(join(generationDirectoryPath(workspacePath, generationId), "manifest.json"));
}

async function readManifestFile(path: string): Promise<WorkspaceGenerationManifest> {
  return readJson<WorkspaceGenerationManifest>(path);
}

async function requireReadablePointer(workspacePath: string, workspace_id: string): Promise<Extract<CurrentPointerStatus, { readonly kind: "valid" }> | null> {
  const status = await readCurrentPointerStatus(workspacePath, workspace_id);
  if (status.kind === "absent") {
    return null;
  }
  if (status.kind === "valid") {
    return status;
  }
  throw new WorkspaceGenerationError(status.code, "current pointer is not usable", status.diagnostics);
}

async function readCurrentPointerStatus(workspacePath: string, workspace_id: string): Promise<CurrentPointerStatus> {
  const pointerPath = join(workspacePath, "current.json");
  let raw: string;
  try {
    raw = await readFile(pointerPath, "utf8");
  } catch (error) {
    if (isMissingFile(error)) {
      return { kind: "absent" };
    }
    return { kind: "malformed", code: "UCFY_CORRUPT_GENERATION", diagnostics: [{ reason: "current_pointer_unreadable" }] };
  }
  let value: unknown;
  try {
    value = JSON.parse(raw) as unknown;
  } catch {
    return { kind: "malformed", code: "UCFY_CORRUPT_GENERATION", diagnostics: [{ reason: "current_pointer_malformed_json" }] };
  }
  if (!isRecord(value) || !isString(value.workspace_id) || !isString(value.generation_id) || !isString(value.manifest_digest)) {
    return { kind: "malformed", code: "UCFY_CORRUPT_GENERATION", diagnostics: [{ reason: "current_pointer_invalid_shape" }] };
  }
  if (value.schema_version !== CURRENT_POINTER_SCHEMA_VERSION) {
    return {
      kind: "unsupported",
      code: "UCFY_REJECTED_UNSUPPORTED_SCHEMA",
      diagnostics: [{ reason: "current_pointer_unsupported_schema", schema_version: String(value.schema_version) }]
    };
  }
  const pointer = value as unknown as CurrentPointer;
  if (workspace_id.length > 0 && pointer.workspace_id !== workspace_id) {
    return {
      kind: "workspace_mismatch",
      code: "UCFY_CORRUPT_GENERATION",
      diagnostics: [{ reason: "current_pointer_workspace_mismatch", pointer_workspace_id: pointer.workspace_id }]
    };
  }
  try {
    validateWorkspaceId(pointer.workspace_id);
    validateGenerationId(pointer.generation_id);
  } catch (error) {
    return {
      kind: "malformed",
      code: "UCFY_CORRUPT_GENERATION",
      diagnostics: [{ reason: "current_pointer_invalid_identifier", detail: redactedError(error) }]
    };
  }
  const generation_path = generationDirectoryPath(workspacePath, pointer.generation_id);
  const manifest = await readManifestFile(join(generation_path, "manifest.json")).catch((error: unknown) => {
    if (isMissingFile(error)) {
      return undefined;
    }
    throw error;
  });
  if (manifest === undefined) {
    return { kind: "missing_generation", code: "UCFY_CORRUPT_GENERATION", diagnostics: [{ reason: "current_pointer_missing_generation" }] };
  }
  if (manifest.workspace_id !== pointer.workspace_id || manifest.generation_id !== pointer.generation_id) {
    return {
      kind: "generation_mismatch",
      code: "UCFY_CORRUPT_GENERATION",
      diagnostics: [{ reason: "current_pointer_generation_manifest_mismatch" }]
    };
  }
  if (pointer.manifest_digest !== manifestDigest(manifest)) {
    return { kind: "generation_mismatch", code: "UCFY_DIVERGENCE", diagnostics: [{ reason: "current_pointer_manifest_digest_mismatch" }] };
  }
  return { kind: "valid", pointer, manifest, generation_path };
}

function pathSegmentForWorkspaceId(workspace_id: string): string {
  validateWorkspaceId(workspace_id);
  return `ws_${Buffer.from(workspace_id.normalize("NFC"), "utf8").toString("base64url")}`;
}

function pathSegmentForGenerationId(generationId: string): string {
  validateGenerationId(generationId);
  return `gen_${Buffer.from(generationId, "utf8").toString("base64url")}`;
}

function validateWorkspaceId(workspace_id: string): void {
  if (workspace_id.length === 0 || workspace_id !== workspace_id.normalize("NFC")) {
    throw new WorkspaceGenerationError("UCFY_CORRUPT_GENERATION", "workspace id is not canonical", [{ reason: "invalid_workspace_id" }]);
  }
  if (
    workspace_id === "." ||
    workspace_id === ".." ||
    workspace_id.includes("/") ||
    workspace_id.includes("\\") ||
    /^[a-zA-Z]:/.test(workspace_id) ||
    workspace_id.startsWith("//") ||
    workspace_id.startsWith("\\\\") ||
    /[. ]$/.test(workspace_id) ||
    isWindowsReservedName(workspace_id)
  ) {
    throw new WorkspaceGenerationError("UCFY_CORRUPT_GENERATION", "workspace id is not path safe", [{ reason: "unsafe_workspace_id" }]);
  }
}

function validateGenerationId(generationId: string): void {
  if (!/^sha256:[0-9a-f]{64}$/.test(generationId)) {
    throw new WorkspaceGenerationError("UCFY_CORRUPT_GENERATION", "generation id is not canonical", [{ reason: "invalid_generation_id" }]);
  }
}

function isHash(value: unknown): value is string {
  return typeof value === "string" && /^sha256:[0-9a-f]{64}$/.test(value);
}

function isWindowsReservedName(value: string): boolean {
  const base = value.split(".")[0]?.toUpperCase();
  return base !== undefined && /^(CON|PRN|AUX|NUL|COM[1-9]|LPT[1-9])$/.test(base);
}

function validateComponentDescriptors(generationPath: string, components: readonly ComponentDescriptor[]): void {
  const expected: Record<GenerationComponentName, string> = {
    provider_state: "components/provider.bin",
    processor_metadata: "components/processor.json",
    citation_state: "components/citations.json",
    relative_anchors: "components/anchors.json",
    semantic_log: "components/semantic-log.json",
    idempotency_state: "components/idempotency.json",
    checkpoint_manifests: "components/checkpoints.json",
    retained_checkpoint_documents: "components/checkpoint-documents.json",
    schema_profile_references: "components/schemas.json",
    migration_metadata: "components/migration.json"
  };
  const seenNames = new Set<GenerationComponentName>();
  const seenPaths = new Set<string>();
  for (const component of components) {
    if (seenNames.has(component.name) || seenPaths.has(component.path)) {
      throw new WorkspaceGenerationError("UCFY_CORRUPT_GENERATION", "duplicate generation component descriptor", [
        { reason: "duplicate_component_descriptor", component: component.name }
      ]);
    }
    seenNames.add(component.name);
    seenPaths.add(component.path);
    if (component.path !== expected[component.name]) {
      throw new WorkspaceGenerationError("UCFY_CORRUPT_GENERATION", "generation component path mismatch", [
        { reason: "unexpected_component_path", component: component.name }
      ]);
    }
    componentAbsolutePath(generationPath, component);
  }
  for (const name of Object.keys(expected) as GenerationComponentName[]) {
    if (!seenNames.has(name)) {
      throw new WorkspaceGenerationError("UCFY_CORRUPT_GENERATION", "generation component descriptor missing", [
        { reason: "missing_component_descriptor", component: name }
      ]);
    }
  }
}

function componentAbsolutePath(generationPath: string, component: ComponentDescriptor): string {
  if (isAbsolute(component.path) || component.path.includes("\\") || component.path.split("/").includes("..") || component.path.split("/").includes(".")) {
    throw new WorkspaceGenerationError("UCFY_CORRUPT_GENERATION", "generation component path is unsafe", [
      { reason: "unsafe_component_path", component: component.name }
    ]);
  }
  const resolved = normalize(join(generationPath, component.path));
  const rel = relative(generationPath, resolved);
  if (rel.startsWith("..") || isAbsolute(rel) || rel.length === 0 || rel.split(sep).includes("..")) {
    throw new WorkspaceGenerationError("UCFY_CORRUPT_GENERATION", "generation component path escapes generation", [
      { reason: "component_path_escape", component: component.name }
    ]);
  }
  return resolved;
}

function schemaProfileReferences(): SchemaProfileReferences {
  return {
    schema_version: "ucf-yjs.schema_profile_references.v1",
    schema_registry_version: SCHEMA_REGISTRY.schema_registry_version,
    canonicalization_profile: SCHEMA_REGISTRY.canonicalization_profile,
    entries: SCHEMA_REGISTRY.entries
      .map((entry) => ({ artifact: entry.artifact, version: entry.version }))
      .sort((left, right) => `${left.artifact}:${left.version}`.localeCompare(`${right.artifact}:${right.version}`))
  };
}

function nativeMigrationMetadata(): WorkspaceMigrationMetadata {
  return {
    schema_version: "ucf-yjs.workspace_migration.v1",
    kind: "native",
    actor_id: null,
    source_schema_version: null,
    target_schema_version: WORKSPACE_GENERATION_SCHEMA_VERSION,
    source_digest: null,
    semantic_frontier_migration: null,
    live_version_transition: null
  };
}

function validateMigrationMetadata(value: unknown, frontier: SemanticFrontier): WorkspaceMigrationMetadata {
  if (!isRecord(value) || value.schema_version !== "ucf-yjs.workspace_migration.v1" || value.target_schema_version !== WORKSPACE_GENERATION_SCHEMA_VERSION) {
    throw new WorkspaceGenerationError("UCFY_CORRUPT_GENERATION", "migration metadata is malformed", [{ reason: "malformed_migration_metadata" }]);
  }
  if (value.kind === "native") {
    if (
      value.actor_id !== null ||
      value.source_schema_version !== null ||
      value.source_digest !== null ||
      value.semantic_frontier_migration !== null ||
      value.live_version_transition !== null
    ) {
      throw new WorkspaceGenerationError("UCFY_CORRUPT_GENERATION", "native migration metadata is malformed", [
        { reason: "malformed_native_migration_metadata" }
      ]);
    }
    return value as unknown as WorkspaceMigrationMetadata;
  }
  if (value.kind !== "m0_local_workspace" || !isString(value.actor_id) || value.source_schema_version !== "ucf-yjs.local_workspace_snapshot.v1" || !isHash(value.source_digest)) {
    throw new WorkspaceGenerationError("UCFY_CORRUPT_GENERATION", "M0 migration metadata is malformed", [
      { reason: "malformed_m0_migration_metadata" }
    ]);
  }
  const transition = value.live_version_transition;
  const migration = value.semantic_frontier_migration;
  if (
    !isRecord(transition) ||
    transition.from_profile !== "ucf-yjs.semantic_frontier.v1" ||
    transition.to_profile !== "ucf-yjs.semantic_frontier.v2" ||
    transition.policy !== "preserve_m0_outcome_live_versions_and_use_v2_for_future_identity" ||
    !isRecord(migration) ||
    migration.schema_version !== "ucf-yjs.semantic_frontier_migration.v1" ||
    migration.from_profile !== "ucf-yjs.semantic_frontier.v1" ||
    migration.to_profile !== "ucf-yjs.semantic_frontier.v2" ||
    migration.observation_policy !== "status_and_agent_view_do_not_advance" ||
    canonicalJson(migration.m0_frontier_anchor as JsonObject) !== canonicalJson(frontier as unknown as JsonObject)
  ) {
    throw new WorkspaceGenerationError("UCFY_CORRUPT_GENERATION", "M0 migration frontier anchor is invalid", [
      { reason: "invalid_m0_frontier_anchor" }
    ]);
  }
  return value as unknown as WorkspaceMigrationMetadata;
}

function allowsM0LiveVersionTransition(migration: WorkspaceMigrationMetadata, frontier: SemanticFrontier): boolean {
  return (
    migration.kind === "m0_local_workspace" &&
    migration.live_version_transition?.policy === "preserve_m0_outcome_live_versions_and_use_v2_for_future_identity" &&
    migration.semantic_frontier_migration !== null &&
    canonicalJson(migration.semantic_frontier_migration.m0_frontier_anchor as unknown as JsonObject) === canonicalJson(frontier as unknown as JsonObject)
  );
}

async function readGenerationMigrationMetadata(generationPath: string, manifest: WorkspaceGenerationManifest): Promise<WorkspaceMigrationMetadata | null> {
  const descriptor = manifest.components.find((component) => component.name === "migration_metadata");
  if (descriptor === undefined) {
    return null;
  }
  const bytes = await readFile(componentAbsolutePath(generationPath, descriptor));
  if (componentDigest(descriptor.name, new Uint8Array(bytes)) !== descriptor.digest) {
    throw new WorkspaceGenerationError("UCFY_DIVERGENCE", "migration metadata digest mismatch", [
      { component: descriptor.name, reason: "component_digest_mismatch" }
    ]);
  }
  const semanticLog = await readJson<readonly SemanticLogRecord[]>(join(generationPath, "components", "semantic-log.json"));
  const validation = validateSemanticLog(semanticLog);
  if (!validation.ok) {
    return null;
  }
  return validateMigrationMetadata(JSON.parse(Buffer.from(bytes).toString("utf8")) as unknown, validation.frontier);
}

async function validateRetainedM0Source(generationPath: string, workspace_id: string, migration: WorkspaceMigrationMetadata): Promise<void> {
  if (migration.kind !== "m0_local_workspace" || migration.source_digest === null) {
    return;
  }
  const workspacePath = dirname(dirname(generationPath));
  const retainedPath = join(workspacePath, "migrations", pathSegmentForGenerationId(migrationId(workspace_id, migration.source_digest)), "source.ucfyjs");
  const sourceBytes = await readFile(retainedPath).catch((error: unknown) => {
    throw new WorkspaceGenerationError("UCFY_CORRUPT_GENERATION", "retained M0 migration source is missing", [
      { reason: "m0_migration_source_missing", detail: redactedError(error) }
    ]);
  });
  const sourceDigest = domainHash("ucf-yjs.m0_local_workspace.source.v1", {
    bytes_base64: Buffer.from(sourceBytes).toString("base64")
  });
  if (sourceDigest !== migration.source_digest) {
    throw new WorkspaceGenerationError("UCFY_DIVERGENCE", "retained M0 migration source digest mismatch", [
      { reason: "m0_migration_source_digest_mismatch" }
    ]);
  }
}

async function findM0MigrationForSource(
  workspacePath: string,
  source_digest: string
): Promise<{ readonly manifest: WorkspaceGenerationManifest; readonly metadata: WorkspaceMigrationMetadata } | null> {
  const entries = await readdir(generationsPath(workspacePath), { withFileTypes: true }).catch(() => []);
  for (const entry of entries) {
    if (!entry.isDirectory()) {
      continue;
    }
    const generationPath = join(generationsPath(workspacePath), entry.name);
    const manifest = await readManifestFile(join(generationPath, "manifest.json")).catch(() => null);
    if (manifest === null || manifest.phase !== "committed") {
      continue;
    }
    const metadata = await readGenerationMigrationMetadata(generationPath, manifest).catch(() => null);
    if (metadata?.kind === "m0_local_workspace" && metadata.source_digest === source_digest) {
      return { manifest, metadata };
    }
  }
  return null;
}

type ParsedM0LocalWorkspaceSnapshot =
  | {
      readonly ok: true;
      readonly snapshot: {
        readonly provider_state: Uint8Array;
        readonly authority: WorkspaceProcessorSnapshot;
      };
    }
  | {
      readonly ok: false;
      readonly code: "UCFY_REJECTED_UNSUPPORTED_SCHEMA" | "UCFY_CORRUPT_GENERATION";
      readonly classification: "unsupported_m0_workspace" | "corrupt_m0_workspace";
      readonly diagnostics: readonly JsonObject[];
    };

function parseM0LocalWorkspaceSnapshot(bytes: Uint8Array): ParsedM0LocalWorkspaceSnapshot {
  let value: unknown;
  try {
    value = JSON.parse(Buffer.from(bytes).toString("utf8")) as unknown;
  } catch {
    return {
      ok: false,
      code: "UCFY_CORRUPT_GENERATION",
      classification: "corrupt_m0_workspace",
      diagnostics: [{ reason: "m0_source_malformed_json" }]
    };
  }
  if (!isRecord(value) || value.schema_version !== "ucf-yjs.local_workspace_snapshot.v1") {
    return {
      ok: false,
      code: "UCFY_REJECTED_UNSUPPORTED_SCHEMA",
      classification: "unsupported_m0_workspace",
      diagnostics: [{ reason: "m0_source_unsupported_schema", schema_version: isRecord(value) ? String(value.schema_version) : "invalid" }]
    };
  }
  if (!isString(value.provider_state) || !isRecord(value.authority)) {
    return {
      ok: false,
      code: "UCFY_CORRUPT_GENERATION",
      classification: "corrupt_m0_workspace",
      diagnostics: [{ reason: "m0_source_invalid_shape" }]
    };
  }
  const authority = value.authority as unknown as WorkspaceProcessorSnapshot;
  if (
    authority.schema_version !== "ucf-yjs.processor_snapshot.v1" ||
    !isString(authority.workspace_id) ||
    !isString(authority.reducer_version) ||
    !Array.isArray(authority.titles) ||
    !Array.isArray(authority.citations) ||
    !Array.isArray(authority.anchors) ||
    !Array.isArray(authority.semantic_log) ||
    !Array.isArray(authority.checkpoints) ||
    !Array.isArray(authority.checkpoint_documents)
  ) {
    return {
      ok: false,
      code: "UCFY_CORRUPT_GENERATION",
      classification: "corrupt_m0_workspace",
      diagnostics: [{ reason: "m0_authority_invalid_shape" }]
    };
  }
  let provider_state: Uint8Array;
  try {
    provider_state = Uint8Array.from(Buffer.from(value.provider_state, "base64"));
    const ydoc = new Y.Doc();
    if (provider_state.byteLength > 0) {
      Y.applyUpdate(ydoc, provider_state);
    }
    WorkspaceProcessor.fromSnapshot(authority, ydoc);
  } catch (error) {
    return {
      ok: false,
      code: "UCFY_CORRUPT_GENERATION",
      classification: "corrupt_m0_workspace",
      diagnostics: [{ reason: "m0_source_unopenable", detail: redactedError(error) }]
    };
  }
  return { ok: true, snapshot: { provider_state, authority } };
}

async function retainM0MigrationSource(root: string, workspace_id: string, migration_id: string, sourceBytes: Uint8Array): Promise<void> {
  const workspacePath = workspaceStorePath(root, workspace_id);
  await writeBytesDurable(join(workspacePath, "migrations", pathSegmentForGenerationId(migration_id), "source.ucfyjs"), sourceBytes);
}

function migrationId(workspace_id: string, source_digest: string): string {
  return domainHash("ucf-yjs.m0_local_workspace_migration.v1", { workspace_id, source_digest });
}

function validateSchemaProfileReferences(value: unknown): void {
  if (!isRecord(value) || value.schema_version !== "ucf-yjs.schema_profile_references.v1" || !Array.isArray(value.entries)) {
    throw new WorkspaceGenerationError("UCFY_CORRUPT_GENERATION", "schema profile references are malformed", [
      { reason: "malformed_schema_profile_references" }
    ]);
  }
  if (value.schema_registry_version !== SCHEMA_REGISTRY.schema_registry_version || value.canonicalization_profile !== SCHEMA_REGISTRY.canonicalization_profile) {
    throw new WorkspaceGenerationError("UCFY_REJECTED_UNSUPPORTED_SCHEMA", "schema profile reference header is unsupported", [
      { reason: "unsupported_schema_profile_reference_header" }
    ]);
  }
  const seen = new Set<string>();
  for (const entry of value.entries) {
    if (!isRecord(entry) || !isString(entry.artifact) || !isString(entry.version)) {
      throw new WorkspaceGenerationError("UCFY_CORRUPT_GENERATION", "schema profile reference entry is malformed", [
        { reason: "malformed_schema_profile_reference_entry" }
      ]);
    }
    const key = `${entry.artifact}:${entry.version}`;
    if (seen.has(key)) {
      throw new WorkspaceGenerationError("UCFY_CORRUPT_GENERATION", "schema profile reference entry is duplicated", [
        { reason: "duplicate_schema_profile_reference", artifact: entry.artifact, version: entry.version }
      ]);
    }
    seen.add(key);
    const compatibility = compatibilityFor(entry.artifact as RegistryArtifact, entry.version);
    if (!compatibility.ok) {
      throw new WorkspaceGenerationError("UCFY_REJECTED_UNSUPPORTED_SCHEMA", "schema profile reference is unsupported", [
        { reason: "unsupported_schema_profile_reference", artifact: entry.artifact, version: entry.version }
      ]);
    }
  }
}

function withPhaseIntegrity(manifest: Omit<WorkspaceGenerationManifest, "phase_integrity_digest"> | WorkspaceGenerationManifest): WorkspaceGenerationManifest {
  const { phase_integrity_digest: _phaseIntegrityDigest, ...withoutDigest } = manifest as WorkspaceGenerationManifest;
  return {
    ...withoutDigest,
    phase_integrity_digest: phaseIntegrityDigest(withoutDigest)
  };
}

function validatePhaseProtocol(manifest: WorkspaceGenerationManifest): void {
  if (manifest.phase_integrity_digest !== phaseIntegrityDigest(manifest)) {
    throw new WorkspaceGenerationError("UCFY_CORRUPT_GENERATION", "generation phase integrity mismatch", [
      { reason: "phase_integrity_mismatch" }
    ]);
  }
  const order: readonly GenerationPhase[] = ["prepared", "material_written", "validated", "published", "committed"];
  if (manifest.phase_history.length === 0 || manifest.phase_history.at(-1) !== manifest.phase) {
    throw new WorkspaceGenerationError("UCFY_CORRUPT_GENERATION", "generation phase history is not current", [
      { reason: "phase_history_not_current" }
    ]);
  }
  for (let index = 0; index < manifest.phase_history.length; index += 1) {
    if (manifest.phase_history[index] !== order[index]) {
      throw new WorkspaceGenerationError("UCFY_CORRUPT_GENERATION", "generation phase history is not monotonic", [
        { reason: "phase_history_invalid" }
      ]);
    }
  }
}

function phaseIntegrityDigest(manifest: Omit<WorkspaceGenerationManifest, "phase_integrity_digest">): string {
  return domainHash("ucf-yjs.workspace_generation.phase_integrity.v1", {
    schema_version: manifest.schema_version,
    workspace_id: manifest.workspace_id,
    generation_id: manifest.generation_id,
    previous_generation_id: manifest.previous_generation_id,
    phase: manifest.phase,
    phase_history: manifest.phase_history,
    reducer_version: manifest.reducer_version,
    components: manifest.components
  } as unknown as JsonObject);
}

async function retainUnclassifiedImport(root: string, workspace_id: string, import_id: string, providerState: Uint8Array): Promise<void> {
  const workspacePath = workspaceStorePath(root, workspace_id);
  const intakePath = join(workspacePath, "imports", pathSegmentForGenerationId(import_id), "provider.bin");
  await writeBytesDurable(intakePath, providerState);
}

function documentsFromYDoc(ydoc: Y.Doc): readonly { readonly document_id: string; readonly text: string }[] {
  return [...ydoc.share.keys()]
    .map((document_id) => ({ document_id, text: ydoc.getText(document_id).toString() }))
    .sort((left, right) => left.document_id.localeCompare(right.document_id));
}

async function hasUnclassifiedImports(workspacePath: string): Promise<boolean> {
  const entries = await readdir(join(workspacePath, "imports")).catch(() => []);
  return entries.length > 0;
}

function blocksOnUnclassifiedImport(operation: string): boolean {
  return operation === "checkpoint.create" || operation === "citation.accept_current";
}

function isMissingFile(error: unknown): boolean {
  return typeof error === "object" && error !== null && "code" in error && (error as { readonly code?: unknown }).code === "ENOENT";
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isString(value: unknown): value is string {
  return typeof value === "string";
}

function generationIdentity(workspace_id: string, previous_generation_id: string | null, material: readonly ComponentMaterial[]): string {
  return domainHash("ucf-yjs.workspace_generation.identity.v1", {
    schema_version: WORKSPACE_GENERATION_SCHEMA_VERSION,
    workspace_id,
    previous_generation_id,
    components: material.map((item) => ({
      name: item.descriptor.name,
      digest: item.descriptor.digest,
      byte_length: item.descriptor.byte_length
    }))
  });
}

function componentDigest(name: GenerationComponentName, bytes: Uint8Array): string {
  return domainHash("ucf-yjs.workspace_generation.component.v1", {
    name,
    bytes_base64: Buffer.from(bytes).toString("base64")
  });
}

function manifestDigest(manifest: WorkspaceGenerationManifest): string {
  return domainHash("ucf-yjs.workspace_generation.manifest.v1", {
    schema_version: manifest.schema_version,
    workspace_id: manifest.workspace_id,
    generation_id: manifest.generation_id,
    previous_generation_id: manifest.previous_generation_id,
    phase_integrity_digest: manifest.phase_integrity_digest,
    reducer_version: manifest.reducer_version,
    components: manifest.components
  } as unknown as JsonObject);
}

function jsonBytes(value: unknown): Uint8Array {
  return Buffer.from(canonicalJson(value as JsonObject), "utf8");
}

async function readJson<T>(path: string): Promise<T> {
  return JSON.parse(await readFile(path, "utf8")) as T;
}

async function writeJsonDurable(path: string, value: unknown): Promise<void> {
  await writeBytesDurable(path, Buffer.from(canonicalJson(value as JsonObject), "utf8"));
}

async function writeBytesDurable(path: string, data: Uint8Array): Promise<void> {
  await mkdir(dirname(path), { recursive: true });
  const temporary = `${path}.tmp-${process.pid}-${Date.now()}`;
  let file;
  try {
    file = await openFile(temporary, "w");
    await file.writeFile(data);
    await file.sync();
    await file.close();
    file = undefined;
    await rename(temporary, path);
    await syncDirectory(dirname(path));
  } catch (error) {
    if (file !== undefined) {
      await file.close().catch(() => undefined);
    }
    await rm(temporary, { force: true }).catch(() => undefined);
    throw error;
  }
}

async function syncDirectory(path: string): Promise<void> {
  try {
    const directory = await openFile(path, "r");
    try {
      await directory.sync();
    } finally {
      await directory.close();
    }
  } catch {
    // Some filesystems do not expose directory fsync; component files are still fsynced.
  }
}

function redactedError(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function redactDiagnostics(diagnostics: readonly JsonObject[]): readonly JsonObject[] {
  return diagnostics.map((diagnostic) => {
    const redacted: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(diagnostic)) {
      redacted[key] = key === "detail" && typeof value === "string" ? value.slice(0, 160) : value;
    }
    return redacted as JsonObject;
  });
}

type LockReady =
  | { readonly ok: true }
  | { readonly ok: false; readonly code: "UCFY_LOCK_BUSY" | "UCFY_LOCK_FAILED"; readonly message: string; readonly diagnostics: readonly JsonObject[] };

function waitForLockHelper(child: ChildProcessWithoutNullStreams, lockPath: string, startupTimeoutMs: number): Promise<LockReady> {
  return new Promise((resolve) => {
    let stdout = "";
    let stderr = "";
    let settled = false;
    const finish = (ready: LockReady) => {
      if (settled) {
        return;
      }
      settled = true;
      clearTimeout(timer);
      resolve(ready);
    };
    const timer = setTimeout(() => {
      child.kill();
      finish({
        ok: false,
        code: "UCFY_LOCK_FAILED",
        message: "workspace writer lock helper startup timed out",
        diagnostics: [{ lock_path: lockPath }]
      });
    }, startupTimeoutMs);
    child.stdout.setEncoding("utf8");
    child.stderr.setEncoding("utf8");
    child.stdout.on("data", (chunk: string) => {
      stdout = boundedAppend(stdout, chunk);
      if (!stdout.includes("\n")) {
        return;
      }
      const line = stdout.split(/\r?\n/, 1)[0] ?? "";
      try {
        const decoded = JSON.parse(line) as { readonly ok?: boolean };
        finish(decoded.ok === true
          ? { ok: true }
          : { ok: false, code: "UCFY_LOCK_FAILED", message: "lock helper returned invalid ready payload", diagnostics: [{ lock_path: lockPath }] });
      } catch {
        finish({ ok: false, code: "UCFY_LOCK_FAILED", message: "lock helper emitted invalid JSON", diagnostics: [{ lock_path: lockPath }] });
      }
    });
    child.stderr.on("data", (chunk: string) => {
      stderr = boundedAppend(stderr, chunk);
    });
    child.on("error", (error) => {
      finish({
        ok: false,
        code: "UCFY_LOCK_FAILED",
        message: "workspace writer lock helper failed to start",
        diagnostics: [{ lock_path: lockPath, detail: redactedError(error) }]
      });
    });
    child.on("exit", (code) => {
      if (settled) {
        return;
      }
      const busy = code === 2 || stderr.includes("LOCK_BUSY");
      finish({
        ok: false,
        code: busy ? "UCFY_LOCK_BUSY" : "UCFY_LOCK_FAILED",
        message: busy ? "workspace writer lock is busy" : "workspace writer lock helper failed",
        diagnostics: [{ lock_path: lockPath, exit_code: code ?? -1 }]
      });
    });
  });
}

function releaseLockHelper(child: ChildProcessWithoutNullStreams): Promise<void> {
  return new Promise((resolve) => {
    let settled = false;
    const finish = () => {
      if (!settled) {
        settled = true;
        resolve();
      }
    };
    if (child.exitCode !== null || child.killed) {
      resolve();
      return;
    }
    child.once("exit", finish);
    child.once("error", finish);
    child.stdin.once("error", finish);
    try {
      child.stdin.end("release\n");
    } catch {
      finish();
    }
  });
}

function boundedAppend(existing: string, chunk: string): string {
  return (existing + chunk).slice(-4096);
}

const PYTHON_LOCK_HELPER = String.raw`
import json
import os
import sys
import time

if os.name == "nt":
    import msvcrt
else:
    import fcntl

path = sys.argv[1]
wait_ms = int(sys.argv[2])
deadline = time.monotonic() + (wait_ms / 1000.0)
os.makedirs(os.path.dirname(path), exist_ok=True)
handle = open(path, "a+b", buffering=0)
if handle.tell() == 0:
    handle.write(b"\0")
handle.seek(0)

def try_lock():
    if os.name == "nt":
        msvcrt.locking(handle.fileno(), msvcrt.LK_NBLCK, 1)
    else:
        fcntl.flock(handle.fileno(), fcntl.LOCK_EX | fcntl.LOCK_NB)

while True:
    try:
        try_lock()
        break
    except OSError:
        if wait_ms == 0 or time.monotonic() >= deadline:
            print("LOCK_BUSY", file=sys.stderr, flush=True)
            sys.exit(2)
        time.sleep(0.025)

print(json.dumps({"ok": True, "pid": os.getpid()}), flush=True)
for _line in sys.stdin.buffer:
    break

try:
    handle.seek(0)
    if os.name == "nt":
        msvcrt.locking(handle.fileno(), msvcrt.LK_UNLCK, 1)
    else:
        fcntl.flock(handle.fileno(), fcntl.LOCK_UN)
finally:
    handle.close()
`;
