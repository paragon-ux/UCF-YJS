import * as Y from "yjs";

import { CheckpointStore, type CheckpointDocumentSnapshot, type CheckpointManifest } from "../../checkpoint-store/src/index.js";
import {
  acceptCurrentEvidence,
  adjustCitationForReplace,
  citationEvent,
  classifyCitation,
  createCitation,
  type MutableCitationState
} from "../../domain-citations/src/index.js";
import { buildProjections, type CapabilityContext, type CollaborativeDocument, type ProjectionSet } from "../../projections/src/index.js";
import {
  COMMAND_SCHEMA_VERSION,
  commandPayloadDigest,
  domainHash,
  type CommandEnvelope,
  type JsonObject,
  type OutcomeCode,
  type OutcomeEnvelope,
  validateCommandEnvelope
} from "../../protocol/src/index.js";
import { SemanticLog, type OutcomeDraft, type SemanticLogRecord } from "../../semantic-log/src/index.js";

export const commandProcessorPackage = {
  name: "command-processor",
  responsibility: "single logical semantic command processor"
} as const;

export interface ProcessorResult {
  readonly outcome: OutcomeEnvelope & { readonly outcome_hash: string };
  readonly projections: ProjectionSet;
}

export interface ProcessorState {
  readonly workspace_id: string;
  readonly documents: readonly CollaborativeDocument[];
  readonly citations: readonly MutableCitationState[];
  readonly semantic_log: SemanticLog;
}

export interface SerializedAnchorState {
  readonly citation_id: string;
  readonly start: readonly number[];
  readonly end: readonly number[];
}

export interface WorkspaceProcessorSnapshot {
  readonly schema_version: "ucf-yjs.processor_snapshot.v1";
  readonly workspace_id: string;
  readonly reducer_version: string;
  readonly titles: readonly (readonly [string, string])[];
  readonly citations: readonly MutableCitationState[];
  readonly anchors: readonly SerializedAnchorState[];
  readonly semantic_log: readonly SemanticLogRecord[];
  readonly checkpoints: readonly CheckpointManifest[];
  readonly checkpoint_documents: readonly CheckpointDocumentSnapshot[];
}

export interface WorkspaceProcessorOptions {
  readonly ydoc?: Y.Doc;
  readonly snapshot?: WorkspaceProcessorSnapshot;
}

export class WorkspaceProcessor {
  private workspace_id: string;
  private readonly ydoc: Y.Doc;
  private readonly titles = new Map<string, string>();
  private readonly citations = new Map<string, MutableCitationState>();
  private readonly anchors = new Map<string, { readonly start: Y.RelativePosition; readonly end: Y.RelativePosition }>();
  readonly semanticLog: SemanticLog;
  checkpoints: CheckpointStore;

  constructor(workspaceId = "workspace.local", private readonly reducer_version = "ucf-yjs.reducer.v1", options: WorkspaceProcessorOptions = {}) {
    const snapshot = options.snapshot;
    this.workspace_id = snapshot?.workspace_id ?? workspaceId;
    this.ydoc = options.ydoc ?? new Y.Doc();
    this.reducer_version = snapshot?.reducer_version ?? reducer_version;
    for (const [documentId, title] of snapshot?.titles ?? []) {
      this.titles.set(documentId, title);
    }
    for (const citation of snapshot?.citations ?? []) {
      this.citations.set(citation.citation_id, structuredClone(citation));
    }
    for (const anchor of snapshot?.anchors ?? []) {
      this.anchors.set(anchor.citation_id, {
        start: Y.decodeRelativePosition(Uint8Array.from(anchor.start)),
        end: Y.decodeRelativePosition(Uint8Array.from(anchor.end))
      });
    }
    this.semanticLog = new SemanticLog(snapshot?.semantic_log ?? []);
    const checkpointDocuments = new Map((snapshot?.checkpoint_documents ?? []).map((item) => [item.checkpoint_id, item.documents] as const));
    this.checkpoints = new CheckpointStore(snapshot?.checkpoints ?? [], checkpointDocuments);
  }

  static fromSnapshot(snapshot: WorkspaceProcessorSnapshot, ydoc = new Y.Doc()): WorkspaceProcessor {
    return new WorkspaceProcessor(snapshot.workspace_id, snapshot.reducer_version, { ydoc, snapshot });
  }

  submit(command: CommandEnvelope, capability: CapabilityContext): ProcessorResult {
    const validation = validateCommandEnvelope(command);
    if (!validation.ok) {
      return this.appendOutcome(commandFromInvalid(command), capability, {
        outcome: "rejected",
        code: validation.issues[0]?.code ?? "UCFY_REJECTED_SCHEMA",
        previous_live_version: this.liveVersion(capability),
        new_live_version: this.liveVersion(capability),
        diagnostics: validation.issues.map((issue) => ({ path: issue.path, code: issue.code }))
      });
    }
    if (!this.isAuthorized(command.operation, capability)) {
      return this.appendOutcome(command, capability, this.conflictDraft("rejected", "UCFY_REJECTED_PERMISSION", "permission_denied", capability));
    }
    const idempotency = this.findIdempotentOutcome(command);
    if (idempotency !== undefined) {
      return this.appendOutcome(command, capability, idempotency);
    }
    const currentLiveVersion = this.liveVersion(capability);
    if (command.observed?.live_version !== undefined && command.observed.live_version !== currentLiveVersion) {
      return this.appendOutcome(command, capability, this.conflictDraft("conflict", "UCFY_CONFLICT_STALE_OBSERVATION", "stale_observation", capability));
    }

    const beforeLiveVersion = currentLiveVersion;
    const staged = this.createExecutionStage();
    const draft = staged.execute(command, capability, beforeLiveVersion);
    return this.appendOutcome(command, capability, draft, staged);
  }

  projections(capability: CapabilityContext): ProjectionSet {
    return buildProjections({
      collaborative: { workspace_id: this.workspace_id, documents: this.documents() },
      semantic_log: this.semanticLog.snapshot(),
      reducer_version: this.reducer_version,
      capability
    });
  }

  state(): ProcessorState {
    return {
      workspace_id: this.workspace_id,
      documents: this.documents(),
      citations: [...this.citations.values()].map((citation) => ({ ...citation })),
      semantic_log: new SemanticLog(this.semanticLog.snapshot())
    };
  }

  snapshot(): WorkspaceProcessorSnapshot {
    return {
      schema_version: "ucf-yjs.processor_snapshot.v1",
      workspace_id: this.workspace_id,
      reducer_version: this.reducer_version,
      titles: [...this.titles.entries()].sort((left, right) => left[0].localeCompare(right[0])),
      citations: [...this.citations.values()]
        .map((citation) => structuredClone(citation))
        .sort((left, right) => left.citation_id.localeCompare(right.citation_id)),
      anchors: [...this.anchors.entries()]
        .map(([citation_id, anchors]) => ({
          citation_id,
          start: [...Y.encodeRelativePosition(anchors.start)],
          end: [...Y.encodeRelativePosition(anchors.end)]
        }))
        .sort((left, right) => left.citation_id.localeCompare(right.citation_id)),
      semantic_log: this.semanticLog.snapshot(),
      checkpoints: this.checkpoints.snapshot(),
      checkpoint_documents: this.checkpoints.documentSnapshot()
    };
  }

  private execute(command: CommandEnvelope, capability: CapabilityContext, beforeLiveVersion: string): OutcomeDraft {
    switch (command.operation) {
      case "workspace.create":
        this.workspace_id = stringPayload(command.payload, "workspace_id") ?? this.workspace_id;
        return this.ok(beforeLiveVersion, [{ type: "workspace.created", workspace_id: this.workspace_id }]);
      case "document.create":
        return this.documentCreate(command, beforeLiveVersion);
      case "document.replace_range":
        return this.documentReplaceRange(command, beforeLiveVersion);
      case "citation.activate":
        return this.citationActivate(command, beforeLiveVersion);
      case "citation.resolve":
        return this.citationResolve(command, beforeLiveVersion);
      case "citation.accept_current":
        return this.citationAcceptCurrent(command, beforeLiveVersion);
      case "citation.deactivate":
        return this.citationDeactivate(command, beforeLiveVersion);
      case "checkpoint.create":
        return this.checkpointCreate(command, capability, beforeLiveVersion);
      case "agent_view.get":
      case "status.get":
        return this.ok(beforeLiveVersion, [{ type: command.operation }]);
      default:
        return this.conflictDraft("conflict", "UCFY_CONFLICT_INVALID_TRANSITION", "unsupported_operation", capability);
    }
  }

  private documentCreate(command: CommandEnvelope, beforeLiveVersion: string): OutcomeDraft {
    const documentId = stringPayload(command.payload, "document_id") ?? stringPayload(command.target, "document_id");
    if (documentId === undefined) {
      return this.missingTarget(beforeLiveVersion);
    }
    this.titles.set(documentId, stringPayload(command.payload, "title") ?? documentId);
    const text = this.ydoc.getText(documentId);
    text.delete(0, text.length);
    text.insert(0, stringPayload(command.payload, "text") ?? "");
    return this.ok(beforeLiveVersion, [{ type: "document.upsert", document_id: documentId }], [{ kind: "document", document_id: documentId }]);
  }

  private documentReplaceRange(command: CommandEnvelope, beforeLiveVersion: string): OutcomeDraft {
    const documentId = stringPayload(command.target, "document_id");
    const start = numberPayload(command.payload, "start");
    const end = numberPayload(command.payload, "end");
    const text = stringPayload(command.payload, "text");
    const document = documentId === undefined || !this.documentExists(documentId) ? undefined : this.ydoc.getText(documentId);
    if (documentId === undefined || document === undefined || start === undefined || end === undefined || text === undefined) {
      return this.missingTarget(beforeLiveVersion);
    }
    if (start < 0 || end < start || end > document.length) {
      return this.conflictDraft("conflict", "UCFY_CONFLICT_INVALID_TRANSITION", "invalid_range", defaultCapability());
    }
    document.delete(start, end - start);
    document.insert(start, text);
    for (const citation of this.citations.values()) {
      if (citation.document_id === documentId) {
        adjustCitationForReplace(citation, start, end, text.length);
        this.resolveAnchors(citation);
        classifyCitation(citation, document.toString());
      }
    }
    return this.ok(beforeLiveVersion, this.citationEventsForDocument(documentId), [{ kind: "document", document_id: documentId }]);
  }

  private citationActivate(command: CommandEnvelope, beforeLiveVersion: string): OutcomeDraft {
    if (command.payload.ambiguous === true) {
      return this.conflictDraft("conflict", "UCFY_CONFLICT_AMBIGUOUS_REFERENCE", "ambiguous_reference", defaultCapability());
    }
    const documentId = stringPayload(command.target, "document_id");
    const document = documentId === undefined || !this.documentExists(documentId) ? undefined : this.ydoc.getText(documentId);
    const start = numberPayload(command.payload, "start");
    const end = numberPayload(command.payload, "end");
    if (documentId === undefined || document === undefined || start === undefined || end === undefined) {
      return this.missingTarget(beforeLiveVersion);
    }
    if (start < 0 || end <= start || end > document.length) {
      return this.conflictDraft("conflict", "UCFY_CONFLICT_INVALID_TRANSITION", "invalid_range", defaultCapability());
    }
    const expectedText = stringPayload(command.payload, "expected_text");
    const actualText = document.toString().slice(start, end);
    if (expectedText !== undefined && expectedText !== actualText) {
      return this.conflictDraft("conflict", "UCFY_CONFLICT_CHANGED_EVIDENCE", "changed_evidence_requires_review", defaultCapability());
    }
    const citation = createCitation({
      citation_id: stringPayload(command.payload, "citation_id") ?? `citation:${documentId}:${start}:${end}`,
      document_id: documentId,
      text: document.toString(),
      start,
      end,
      boundary: command.payload.boundary === "left" ? "left" : "right"
    });
    this.citations.set(citation.citation_id, citation);
    this.anchors.set(citation.citation_id, {
      start: Y.createRelativePositionFromTypeIndex(document, start, citation.boundary === "left" ? -1 : 1),
      end: Y.createRelativePositionFromTypeIndex(document, end, citation.boundary === "left" ? -1 : 1)
    });
    return this.ok(beforeLiveVersion, [citationEvent(citation)], [{ kind: "citation", citation_id: citation.citation_id }]);
  }

  private citationResolve(command: CommandEnvelope, beforeLiveVersion: string): OutcomeDraft {
    const citation = this.getCitation(command);
    if (citation === undefined) {
      return this.missingTarget(beforeLiveVersion);
    }
    this.resolveAnchors(citation);
    classifyCitation(citation, this.ydoc.getText(citation.document_id).toString());
    return this.ok(beforeLiveVersion, [citationEvent(citation)], [{ kind: "citation", citation_id: citation.citation_id }]);
  }

  private citationAcceptCurrent(command: CommandEnvelope, beforeLiveVersion: string): OutcomeDraft {
    const citation = this.getCitation(command);
    if (citation === undefined) {
      return this.missingTarget(beforeLiveVersion);
    }
    if (citation.status === "inactive") {
      return this.conflictDraft("conflict", "UCFY_CONFLICT_INVALID_TRANSITION", "inactive_citation", defaultCapability());
    }
    this.resolveAnchors(citation);
    acceptCurrentEvidence(citation, this.ydoc.getText(citation.document_id).toString());
    return this.ok(beforeLiveVersion, [citationEvent(citation)], [{ kind: "citation", citation_id: citation.citation_id }]);
  }

  private citationDeactivate(command: CommandEnvelope, beforeLiveVersion: string): OutcomeDraft {
    const citation = this.getCitation(command);
    if (citation === undefined) {
      return this.missingTarget(beforeLiveVersion);
    }
    citation.status = "inactive";
    return this.ok(beforeLiveVersion, [citationEvent(citation)], [{ kind: "citation", citation_id: citation.citation_id }]);
  }

  private checkpointCreate(command: CommandEnvelope, capability: CapabilityContext, beforeLiveVersion: string): OutcomeDraft {
    const projections = this.projections(capability);
    const providerSnapshotRef = stringPayload(command.payload, "provider_snapshot_ref");
    const manifest = this.checkpoints.save({
      workspace_id: this.workspace_id,
      created_by: command.actor.actor_id,
      created_at: stringPayload(command.payload, "created_at") ?? "1970-01-01T00:00:00.000Z",
      domain: "citations",
      parent_checkpoint_id: stringPayload(command.payload, "parent_checkpoint_id") ?? null,
      live_version: projections.workspace_status.live_version,
      semantic_frontier: projections.workspace_status.semantic_frontier,
      documents: this.documents(),
      anchor_projection_digest: projections.anchor_projection_digest,
      accepted_projection_digest: projections.accepted_projection_digest,
      collaborative_schema_version: "ucf-yjs.collab.v1",
      domain_schema_version: "ucf-yjs.citations.v1",
      reducer_version: this.reducer_version,
      policy: localCheckpointPolicy(),
      verification: { canonical_agent_view_digest: projections.canonical_full_view_digest },
      ...(providerSnapshotRef === undefined ? {} : { provider_snapshot_ref: providerSnapshotRef })
    });
    return this.ok(beforeLiveVersion, [{ type: "checkpoint.created", checkpoint_id: manifest.checkpoint_id }], [{ kind: "checkpoint", checkpoint_id: manifest.checkpoint_id }]);
  }

  private appendOutcome(command: CommandEnvelope, capability: CapabilityContext, draft: OutcomeDraft, staged?: WorkspaceProcessor): ProcessorResult {
    const result = this.semanticLog.append(command, { ...draft, new_live_version: null });
    if (result.outcome_appended && staged !== undefined) {
      this.commitStagedState(staged);
    }
    const projections = this.projections(capability);
    const outcome = result.outcome_appended
      ? this.semanticLog.setOutcomeNewLiveVersion(command.command_id, projections.workspace_status.live_version)
      : result.outcome;
    return {
      outcome,
      projections
    };
  }

  private createExecutionStage(): WorkspaceProcessor {
    const ydoc = new Y.Doc();
    Y.applyUpdate(ydoc, Y.encodeStateAsUpdate(this.ydoc));
    return new WorkspaceProcessor(this.workspace_id, this.reducer_version, { ydoc, snapshot: this.snapshot() });
  }

  private commitStagedState(staged: WorkspaceProcessor): void {
    Y.applyUpdate(this.ydoc, Y.encodeStateAsUpdate(staged.ydoc));
    this.titles.clear();
    for (const [documentId, title] of staged.titles.entries()) {
      this.titles.set(documentId, title);
    }
    this.citations.clear();
    for (const [citationId, citation] of staged.citations.entries()) {
      this.citations.set(citationId, structuredClone(citation));
    }
    this.anchors.clear();
    for (const [citationId, anchors] of staged.anchors.entries()) {
      this.anchors.set(citationId, {
        start: Y.decodeRelativePosition(Y.encodeRelativePosition(anchors.start)),
        end: Y.decodeRelativePosition(Y.encodeRelativePosition(anchors.end))
      });
    }
    const checkpointDocuments = new Map(staged.checkpoints.documentSnapshot().map((item) => [item.checkpoint_id, item.documents] as const));
    this.checkpoints = new CheckpointStore(staged.checkpoints.snapshot(), checkpointDocuments);
  }

  private ok(previousLiveVersion: string, events: readonly JsonObject[] = [], affected_resources: readonly JsonObject[] = []): OutcomeDraft {
    return {
      outcome: "committed",
      code: "UCFY_OK",
      previous_live_version: previousLiveVersion,
      new_live_version: null,
      affected_resources,
      events,
      allowed_actions: [],
      diagnostics: []
    };
  }

  private conflictDraft(outcome: "rejected" | "conflict", code: OutcomeCode, reason: string, capability: CapabilityContext): OutcomeDraft {
    const live = this.liveVersion(capability);
    return {
      outcome,
      code,
      previous_live_version: live,
      new_live_version: null,
      diagnostics: [{ reason }]
    };
  }

  private missingTarget(beforeLiveVersion: string): OutcomeDraft {
    return {
      outcome: "conflict",
      code: "UCFY_CONFLICT_MISSING_TARGET",
      previous_live_version: beforeLiveVersion,
      new_live_version: null,
      diagnostics: [{ reason: "missing_target" }]
    };
  }

  private liveVersion(capability: CapabilityContext): string {
    return this.projections(capability).workspace_status.live_version;
  }

  private documents(): readonly CollaborativeDocument[] {
    const documents: CollaborativeDocument[] = [];
    for (const name of this.ydoc.share.keys()) {
      const text = this.ydoc.getText(name);
      const title = this.titles.get(name);
      documents.push({ document_id: name, text: text.toString(), ...(title === undefined ? {} : { title }) });
    }
    return documents.sort((left, right) => left.document_id.localeCompare(right.document_id));
  }

  private citationEventsForDocument(documentId: string): readonly JsonObject[] {
    return [...this.citations.values()]
      .filter((citation) => citation.document_id === documentId)
      .map((citation) => citationEvent(citation));
  }

  private getCitation(command: CommandEnvelope): MutableCitationState | undefined {
    const citationId = stringPayload(command.payload, "citation_id") ?? stringPayload(command.target, "citation_id");
    return citationId === undefined ? undefined : this.citations.get(citationId);
  }

  private resolveAnchors(citation: MutableCitationState): void {
    const anchors = this.anchors.get(citation.citation_id);
    if (anchors === undefined) {
      return;
    }
    const start = Y.createAbsolutePositionFromRelativePosition(anchors.start, this.ydoc);
    const end = Y.createAbsolutePositionFromRelativePosition(anchors.end, this.ydoc);
    if (start === null || end === null || start.type !== end.type) {
      citation.status = "missing";
      return;
    }
    citation.start = Math.min(start.index, end.index);
    citation.end = Math.max(start.index, end.index);
  }

  private isAuthorized(operation: string, capability: CapabilityContext): boolean {
    if (operation === "agent_view.get" || operation === "status.get") {
      return true;
    }
    if (operation === "checkpoint.create" || operation === "citation.accept_current") {
      return capability.can_accept;
    }
    return capability.can_write;
  }

  private findIdempotentOutcome(command: CommandEnvelope): OutcomeDraft | undefined {
    const payloadDigest = commandPayloadDigest(command);
    const commandRecord = this.semanticLog.snapshot().find((record) => record.record_type === "command" && record.command_id === command.command_id);
    if (commandRecord !== undefined) {
      return this.ok(this.liveVersion(defaultCapability()));
    }
    const samePayload = this.semanticLog.snapshot().find(
      (record) =>
        record.record_type === "command" &&
        record.command.idempotency_key === command.idempotency_key &&
        record.payload_digest === payloadDigest
    );
    if (samePayload !== undefined) {
      return this.ok(this.liveVersion(defaultCapability()));
    }
    const sameKey = this.semanticLog.snapshot().find(
      (record) => record.record_type === "command" && record.command.idempotency_key === command.idempotency_key
    );
    if (sameKey !== undefined) {
      return this.conflictDraft("conflict", "UCFY_CONFLICT_IDEMPOTENCY_PAYLOAD", "idempotency_key_reused_with_different_payload", defaultCapability());
    }
    return undefined;
}

  private documentExists(documentId: string): boolean {
    return this.ydoc.share.has(documentId);
  }
}

export function createCommand(input: Omit<CommandEnvelope, "schema_version">): CommandEnvelope {
  return { schema_version: COMMAND_SCHEMA_VERSION, ...input };
}

function stringPayload(value: JsonObject, key: string): string | undefined {
  return typeof value[key] === "string" ? value[key] : undefined;
}

function numberPayload(value: JsonObject, key: string): number | undefined {
  return typeof value[key] === "number" ? value[key] : undefined;
}

function defaultCapability(): CapabilityContext {
  return { actor_id: "processor", can_read_content: true, can_write: true, can_accept: true };
}

function localCheckpointPolicy() {
  return {
    retention: "retain-documents",
    visibility: "private",
    exportability: "metadata",
    evidence_text_disclosure: "deny",
    diagnostic_redaction: "required",
    checkpoint_sharing: "private"
  } as const;
}

function commandFromInvalid(value: unknown): CommandEnvelope {
  const digest = invalidCommandDigest(value);
  const payload = { invalid_request_digest: digest };
  if (typeof value === "object" && value !== null && "command_id" in value && typeof value.command_id === "string") {
    return createCommand({
      command_id: value.command_id,
      idempotency_key: `invalid:${value.command_id}:${digest}`,
      actor: { actor_id: "invalid", kind: "agent" },
      workspace_id: "invalid",
      operation: "invalid",
      target: { kind: "invalid" },
      payload
    });
  }
  return createCommand({
    command_id: `invalid-command:${digest}`,
    idempotency_key: `invalid:${digest}`,
    actor: { actor_id: "invalid", kind: "agent" },
    workspace_id: "invalid",
    operation: "invalid",
    target: { kind: "invalid" },
    payload
  });
}

function invalidCommandDigest(value: unknown): string {
  return domainHash("ucf-yjs.invalid_command.v1", { value: stableUnknown(value) });
}

function stableUnknown(value: unknown): JsonObject {
  if (value === null) {
    return { type: "null", value: null };
  }
  if (typeof value === "string" || typeof value === "boolean") {
    return { type: typeof value, value };
  }
  if (typeof value === "number") {
    return Number.isSafeInteger(value) ? { type: "number", value } : { type: "number", value: String(value) };
  }
  if (Array.isArray(value)) {
    return { type: "array", value: value.map((item) => stableUnknown(item)) };
  }
  if (typeof value === "object") {
    const entries = Object.entries(value as Record<string, unknown>)
      .sort((left, right) => left[0].localeCompare(right[0]))
      .map(([key, child]) => ({ key, value: stableUnknown(child) }));
    return { type: "object", value: entries };
  }
  return { type: typeof value, value: String(value) };
}
