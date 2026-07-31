import { spawn, type ChildProcessWithoutNullStreams } from "node:child_process";
import { open as openFile, mkdir, readFile, readdir, rename, rm } from "node:fs/promises";
import { dirname, join } from "node:path";

import * as Y from "yjs";

import { WorkspaceProcessor, type WorkspaceProcessorSnapshot } from "../../command-processor/src/index.js";
import { canonicalJson, domainHash, type CommandEnvelope, type JsonObject } from "../../protocol/src/index.js";
import { SCHEMA_REGISTRY, validateSchemaRegistry } from "../../protocol/src/schema-registry.js";
import { validateSemanticLog, type SemanticLogRecord } from "../../semantic-log/src/index.js";

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
  | "schema_profile_references";

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

interface ComponentMaterial {
  readonly descriptor: ComponentDescriptor;
  readonly bytes: Uint8Array;
}

interface PendingGeneration {
  readonly path: string;
  readonly manifest: WorkspaceGenerationManifest;
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
  const child = spawn("python", ["-c", PYTHON_LOCK_HELPER, lock_path, String(waitMs)], {
    stdio: ["pipe", "pipe", "pipe"],
    windowsHide: true
  });
  const ready = await waitForLockHelper(child, lock_path);
  if (!ready.ok) {
    throw new WorkspaceLockError(ready.code, ready.message, ready.diagnostics);
  }
  return {
    workspace_id,
    lock_path,
    release: async () => {
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
  const workspacePath = workspaceStorePath(input.root, input.workspace_id);
  await mkdir(generationsPath(workspacePath), { recursive: true });
  const previous = await readCurrentPointer(workspacePath);
  const snapshot = input.processor.snapshot();
  const providerState = input.ydoc === undefined ? new Uint8Array() : Y.encodeStateAsUpdate(input.ydoc);
  const material = buildMaterial(providerState, snapshot);
  const generation_id = generationIdentity(input.workspace_id, previous?.generation_id ?? null, material);
  const generationPath = generationDirectoryPath(workspacePath, generation_id);
  await mkdir(join(generationPath, "components"), { recursive: true });

  let manifest: WorkspaceGenerationManifest = {
    schema_version: WORKSPACE_GENERATION_SCHEMA_VERSION,
    workspace_id: input.workspace_id,
    generation_id,
    previous_generation_id: previous?.generation_id ?? null,
    phase: "prepared",
    phase_history: ["prepared"],
    reducer_version: snapshot.reducer_version,
    created_at: input.created_at ?? "1970-01-01T00:00:00.000Z",
    components: material.map((item) => item.descriptor)
  };
  await writeJsonDurable(join(generationPath, "manifest.json"), manifest);
  maybeFail(input.fault_injection, "prepared");

  for (const component of material) {
    await writeBytesDurable(join(generationPath, component.descriptor.path), component.bytes);
  }
  manifest = await advancePhase(generationPath, manifest, "material_written", input.fault_injection);

  await validateGeneration(generationPath, manifest);
  manifest = await advancePhase(generationPath, manifest, "validated", input.fault_injection);

  await writeCurrentPointer(workspacePath, input.workspace_id, manifest);
  manifest = await advancePhase(generationPath, manifest, "published", input.fault_injection);
  manifest = await advancePhase(generationPath, manifest, "committed", input.fault_injection);
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
    return publishWorkspaceGeneration({ root, workspace_id, processor, ydoc });
  });
}

export async function submitDurableCommand(input: DurableCommandInput): Promise<DurableCommandResult> {
  return withWorkspaceLock(input.root, input.workspace_id, async () => {
    const opened = await openDurableWorkspace(input.root, input.workspace_id);
    const ydoc = opened?.ydoc ?? new Y.Doc();
    const processor = opened?.processor ?? new WorkspaceProcessor(input.workspace_id, "ucf-yjs.reducer.v1", { ydoc });
    const before = canonicalJson(processor.semanticLog.snapshot() as unknown as JsonObject);
    const result = processor.submit(input.command, input.capability ?? runtimeValidationCapability());
    const after = canonicalJson(processor.semanticLog.snapshot() as unknown as JsonObject);
    if (before === after) {
      return { result, generation_published: false, generation_id: opened?.generation.generation_id ?? null };
    }
    const generation = await publishWorkspaceGeneration({ root: input.root, workspace_id: input.workspace_id, processor, ydoc });
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

export async function importProviderState(root: string, workspace_id: string, providerState: Uint8Array): Promise<WorkspaceGenerationManifest> {
  return withWorkspaceLock(root, workspace_id, async () => {
    const opened = await openDurableWorkspace(root, workspace_id);
    const ydoc = new Y.Doc();
    if (providerState.byteLength > 0) {
      Y.applyUpdate(ydoc, providerState);
    }
    const processor = opened?.processor ?? new WorkspaceProcessor(workspace_id, "ucf-yjs.reducer.v1", { ydoc });
    return publishWorkspaceGeneration({ root, workspace_id, processor, ydoc });
  });
}

export async function resolveWorkspaceRecovery(root: string, workspace_id: string): Promise<WorkspaceRecoveryReport> {
  return withWorkspaceLock(root, workspace_id, async () => recoverWorkspaceGeneration(root, workspace_id));
}

export async function recoverWorkspaceGeneration(root: string, workspace_id: string): Promise<WorkspaceRecoveryReport> {
  const workspacePath = workspaceStorePath(root, workspace_id);
  const current = await readCurrentPointer(workspacePath);
  const committedCurrent = current === null ? null : await readGenerationManifest(workspacePath, current.generation_id).catch(() => null);
  if (current !== null && committedCurrent !== null && current.manifest_digest !== manifestDigest(committedCurrent)) {
    return {
      classification: "divergence",
      active_generation_id: null,
      diagnostics: [{ reason: "current_pointer_manifest_digest_mismatch" }]
    };
  }
  const active_generation_id = committedCurrent?.phase === "committed" ? committedCurrent.generation_id : null;
  const candidates = (await pendingGenerations(workspacePath)).filter((item) => item.manifest.phase !== "committed");
  if (candidates.length === 0) {
    return { classification: "clean", active_generation_id, diagnostics: [] };
  }
  const newest = candidates
    .sort((left, right) => phaseRank(left.manifest.phase) - phaseRank(right.manifest.phase) || left.manifest.generation_id.localeCompare(right.manifest.generation_id))
    .at(-1)!;
  if (newest.manifest.phase === "prepared") {
    return {
      classification: "clean",
      active_generation_id,
      diagnostics: [{ reason: "prepared_generation_has_not_reached_material_write" }]
    };
  }
  try {
    await validateGeneration(newest.path, newest.manifest);
  } catch (error) {
    if (error instanceof WorkspaceGenerationError && error.code === "UCFY_DIVERGENCE") {
      return { classification: "divergence", active_generation_id, diagnostics: error.diagnostics };
    }
    return {
      classification: "recovery_required",
      active_generation_id,
      diagnostics: [{ reason: "pending_generation_incomplete_or_invalid", detail: redactedError(error) }]
    };
  }
  let manifest = newest.manifest;
  if (manifest.phase === "material_written") {
    manifest = await advancePhase(newest.path, manifest, "validated");
  }
  await writeCurrentPointer(workspacePath, workspace_id, manifest);
  if (manifest.phase !== "published") {
    manifest = await advancePhase(newest.path, manifest, "published");
  }
  manifest = await advancePhase(newest.path, manifest, "committed");
  return {
    classification: "recovered",
    active_generation_id: manifest.generation_id,
    recovered_generation_id: manifest.generation_id,
    diagnostics: []
  };
}

export async function openDurableWorkspace(root: string, workspace_id: string): Promise<DurableWorkspaceSnapshot | null> {
  const recovery = await recoverWorkspaceGeneration(root, workspace_id);
  if (recovery.classification === "recovery_required" || recovery.classification === "divergence") {
    throw new WorkspaceGenerationError(
      recovery.classification === "divergence" ? "UCFY_DIVERGENCE" : "UCFY_RECOVERY_REQUIRED",
      `workspace ${workspace_id} requires operator attention`,
      recovery.diagnostics
    );
  }
  const workspacePath = workspaceStorePath(root, workspace_id);
  const current = await readCurrentPointer(workspacePath);
  if (current === null) {
    return null;
  }
  const generationPath = generationDirectoryPath(workspacePath, current.generation_id);
  const manifest = await readManifestFile(join(generationPath, "manifest.json")).catch((error: unknown) => {
    throw new WorkspaceGenerationError("UCFY_CORRUPT_GENERATION", "generation manifest is malformed", [
      { reason: "malformed_generation_manifest", detail: redactedError(error) }
    ]);
  });
  if (current.manifest_digest !== manifestDigest(manifest)) {
    throw new WorkspaceGenerationError("UCFY_DIVERGENCE", "current pointer manifest digest mismatch", [
      { reason: "current_pointer_manifest_digest_mismatch" }
    ]);
  }
  await validateGeneration(generationPath, manifest);
  const processorSnapshot = await readJson<WorkspaceProcessorSnapshot>(join(generationPath, "components", "processor.json"));
  const providerState = await readFile(join(generationPath, "components", "provider.bin"));
  const ydoc = new Y.Doc();
  if (providerState.byteLength > 0) {
    Y.applyUpdate(ydoc, new Uint8Array(providerState));
  }
  return {
    generation: manifest,
    ydoc,
    processor: WorkspaceProcessor.fromSnapshot(processorSnapshot, ydoc)
  };
}

export async function inspectWorkspaceGeneration(root: string, workspace_id: string): Promise<WorkspaceRecoveryReport> {
  return recoverWorkspaceGeneration(root, workspace_id);
}

export async function validateDurableWorkspace(root: string, workspace_id: string): Promise<WorkspaceValidationResult> {
  try {
    const workspacePath = workspaceStorePath(root, workspace_id);
    const current = await readCurrentPointer(workspacePath);
    if (current === null) {
      return { ok: true, workspace_id, generation_id: null };
    }
    const generationPath = generationDirectoryPath(workspacePath, current.generation_id);
    const manifest = await readManifestFile(join(generationPath, "manifest.json")).catch((error: unknown) => {
      throw new WorkspaceGenerationError("UCFY_CORRUPT_GENERATION", "generation manifest is malformed", [
        { reason: "malformed_generation_manifest", detail: redactedError(error) }
      ]);
    });
    if (current.manifest_digest !== manifestDigest(manifest)) {
      throw new WorkspaceGenerationError("UCFY_DIVERGENCE", "current pointer manifest digest mismatch", [
        { reason: "current_pointer_manifest_digest_mismatch" }
      ]);
    }
    await validateGeneration(generationPath, manifest);
    return { ok: true, workspace_id, generation_id: manifest.generation_id };
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
  return join(root, ".ucf-yjs", "workspaces", encodeURIComponent(workspace_id));
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
  return join(generationsPath(workspacePath), encodeURIComponent(generationId));
}

function buildMaterial(providerState: Uint8Array, snapshot: WorkspaceProcessorSnapshot): readonly ComponentMaterial[] {
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
    ["schema_profile_references", "components/schemas.json", jsonBytes(SCHEMA_REGISTRY), "application/json"]
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
  if (!validateSchemaRegistry(SCHEMA_REGISTRY).ok) {
    throw new WorkspaceGenerationError("UCFY_REJECTED_UNSUPPORTED_SCHEMA", "invalid schema registry");
  }
  for (const component of manifest.components) {
    const bytes = await readFile(join(generationPath, component.path)).catch((error: unknown) => {
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
  const expectedIdempotency = snapshot.semantic_log.filter((record) => record.record_type === "idempotency");
  assertCrossPlaneEqual("citation_state", citations, snapshot.citations);
  assertCrossPlaneEqual("relative_anchors", anchors, snapshot.anchors);
  assertCrossPlaneEqual("semantic_log", semanticLog, snapshot.semantic_log);
  assertCrossPlaneEqual("idempotency_state", idempotency, expectedIdempotency);
  assertCrossPlaneEqual("checkpoint_manifests", checkpoints, snapshot.checkpoints);
  assertCrossPlaneEqual("retained_checkpoint_documents", checkpointDocuments, snapshot.checkpoint_documents);
  assertCrossPlaneEqual("schema_profile_references", schemaProfileReferences, SCHEMA_REGISTRY);
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
      if (rebuilt !== lastLiveVersion.outcome.new_live_version) {
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
  const advanced: WorkspaceGenerationManifest = {
    ...manifest,
    phase,
    phase_history: [...manifest.phase_history, phase]
  };
  await writeJsonDurable(join(generationPath, "manifest.json"), advanced);
  maybeFail(faultInjection, phase);
  return advanced;
}

function maybeFail(faultInjection: FaultInjection | undefined, phase: GenerationPhase): void {
  if (faultInjection?.fail_after_phase === phase) {
    throw new WorkspaceGenerationError("UCFY_RECOVERY_REQUIRED", `fault injection after generation phase ${phase}`, [{ phase }]);
  }
}

function phaseRank(phase: GenerationPhase): number {
  switch (phase) {
    case "prepared":
      return 0;
    case "material_written":
      return 1;
    case "validated":
      return 2;
    case "published":
      return 3;
    case "committed":
      return 4;
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

async function readGenerationManifest(workspacePath: string, generationId: string): Promise<WorkspaceGenerationManifest> {
  return readManifestFile(join(generationDirectoryPath(workspacePath, generationId), "manifest.json"));
}

async function readManifestFile(path: string): Promise<WorkspaceGenerationManifest> {
  return readJson<WorkspaceGenerationManifest>(path);
}

async function readCurrentPointer(workspacePath: string): Promise<CurrentPointer | null> {
  try {
    const pointer = await readJson<CurrentPointer>(join(workspacePath, "current.json"));
    return pointer.schema_version === CURRENT_POINTER_SCHEMA_VERSION ? pointer : null;
  } catch {
    return null;
  }
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

function waitForLockHelper(child: ChildProcessWithoutNullStreams, lockPath: string): Promise<LockReady> {
  return new Promise((resolve) => {
    let stdout = "";
    let stderr = "";
    let settled = false;
    child.stdout.setEncoding("utf8");
    child.stderr.setEncoding("utf8");
    child.stdout.on("data", (chunk: string) => {
      stdout += chunk;
      if (settled || !stdout.includes("\n")) {
        return;
      }
      settled = true;
      const line = stdout.split(/\r?\n/, 1)[0] ?? "";
      try {
        const decoded = JSON.parse(line) as { readonly ok?: boolean };
        resolve(decoded.ok === true
          ? { ok: true }
          : { ok: false, code: "UCFY_LOCK_FAILED", message: "lock helper returned invalid ready payload", diagnostics: [{ lock_path: lockPath }] });
      } catch {
        resolve({ ok: false, code: "UCFY_LOCK_FAILED", message: "lock helper emitted invalid JSON", diagnostics: [{ lock_path: lockPath }] });
      }
    });
    child.stderr.on("data", (chunk: string) => {
      stderr += chunk;
    });
    child.on("exit", (code) => {
      if (settled) {
        return;
      }
      settled = true;
      const busy = code === 2 || stderr.includes("LOCK_BUSY");
      resolve({
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
    if (child.exitCode !== null) {
      resolve();
      return;
    }
    child.on("exit", () => resolve());
    child.stdin.end("release\n");
  });
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
