import * as Y from "yjs";

import { CheckpointStore } from "../../checkpoint-store/src/index.js";
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
  type CommandEnvelope,
  type JsonObject,
  type OutcomeCode,
  type OutcomeEnvelope,
  validateCommandEnvelope
} from "../../protocol/src/index.js";
import { SemanticLog, type OutcomeDraft } from "../../semantic-log/src/index.js";

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

export class WorkspaceProcessor {
  private workspace_id: string;
  private readonly ydoc = new Y.Doc();
  private readonly titles = new Map<string, string>();
  private readonly citations = new Map<string, MutableCitationState>();
  private readonly anchors = new Map<string, { readonly start: Y.RelativePosition; readonly end: Y.RelativePosition }>();
  readonly semanticLog = new SemanticLog();
  readonly checkpoints = new CheckpointStore();

  constructor(workspaceId = "workspace.local", private readonly reducer_version = "ucf-yjs.reducer.v1") {
    this.workspace_id = workspaceId;
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
    const draft = this.execute(command, capability, beforeLiveVersion);
    return this.appendOutcome(command, capability, draft);
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
    if (documentId === undefined || document === undefined || start === undefined || end === undefined || end > document.length) {
      return this.missingTarget(beforeLiveVersion);
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
      parent_checkpoint_id: stringPayload(command.payload, "parent_checkpoint_id") ?? null,
      semantic_frontier: projections.workspace_status.semantic_frontier,
      documents: this.documents(),
      anchor_projection_digest: projections.anchor_projection_digest,
      accepted_projection_digest: projections.accepted_projection_digest,
      collaborative_schema_version: "ucf-yjs.collab.v1",
      domain_schema_version: "ucf-yjs.citations.v1",
      reducer_version: this.reducer_version,
      policy: { retention: "keep", acceptance: "processor" },
      ...(providerSnapshotRef === undefined ? {} : { provider_snapshot_ref: providerSnapshotRef })
    });
    return this.ok(beforeLiveVersion, [{ type: "checkpoint.created", checkpoint_id: manifest.checkpoint_id }], [{ kind: "checkpoint", checkpoint_id: manifest.checkpoint_id }]);
  }

  private appendOutcome(command: CommandEnvelope, capability: CapabilityContext, draft: OutcomeDraft): ProcessorResult {
    const result = this.semanticLog.append(command, draft);
    return {
      outcome: result.outcome,
      projections: this.projections(capability)
    };
  }

  private ok(previousLiveVersion: string, events: readonly JsonObject[] = [], affected_resources: readonly JsonObject[] = []): OutcomeDraft {
    return {
      outcome: "committed",
      code: "UCFY_OK",
      previous_live_version: previousLiveVersion,
      new_live_version: this.liveVersion(defaultCapability()),
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
      new_live_version: live,
      diagnostics: [{ reason }]
    };
  }

  private missingTarget(beforeLiveVersion: string): OutcomeDraft {
    return {
      outcome: "conflict",
      code: "UCFY_CONFLICT_MISSING_TARGET",
      previous_live_version: beforeLiveVersion,
      new_live_version: beforeLiveVersion,
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
    if (operation === "checkpoint.create") {
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

function commandFromInvalid(value: unknown): CommandEnvelope {
  if (typeof value === "object" && value !== null && "command_id" in value && typeof value.command_id === "string") {
    return createCommand({
      command_id: value.command_id,
      idempotency_key: "invalid",
      actor: { actor_id: "invalid", kind: "agent" },
      workspace_id: "invalid",
      operation: "invalid",
      target: { kind: "invalid" },
      payload: {}
    });
  }
  return createCommand({
    command_id: "invalid-command",
    idempotency_key: "invalid",
    actor: { actor_id: "invalid", kind: "agent" },
    workspace_id: "invalid",
    operation: "invalid",
    target: { kind: "invalid" },
    payload: {}
  });
}
