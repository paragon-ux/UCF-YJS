import { domainHash, type JsonObject } from "../../protocol/src/index.js";
import {
  validateSemanticLog,
  type OutcomeLogRecord,
  type SemanticFrontier,
  type SemanticLogRecord
} from "../../semantic-log/src/index.js";

export const projectionsPackage = {
  name: "projections",
  responsibility: "deterministic rebuildable projections"
} as const;

export interface CollaborativeDocument {
  readonly document_id: string;
  readonly title?: string;
  readonly text: string;
}

export interface CollaborativeState {
  readonly workspace_id: string;
  readonly documents: readonly CollaborativeDocument[];
}

export interface CapabilityContext {
  readonly actor_id: string;
  readonly can_read_content: boolean;
  readonly can_write: boolean;
  readonly can_accept: boolean;
  readonly max_agent_items?: number;
}

export interface ProjectionInput {
  readonly collaborative: CollaborativeState;
  readonly semantic_log: readonly SemanticLogRecord[];
  readonly reducer_version: string;
  readonly capability: CapabilityContext;
}

export interface DocumentProjection {
  readonly document_id: string;
  readonly title: string | null;
  readonly text: string | null;
  readonly text_length: number;
}

export interface CitationProjection {
  readonly citation_id: string;
  readonly document_id: string;
  readonly status: string;
  readonly range: { readonly start: number; readonly end: number } | null;
}

export interface ConflictProjection {
  readonly command_id: string;
  readonly code: string;
  readonly diagnostics: readonly JsonObject[];
}

export interface WorkspaceStatusProjection {
  readonly workspace_id: string;
  readonly reducer_version: string;
  readonly document_count: number;
  readonly citation_count: number;
  readonly conflict_count: number;
  readonly semantic_frontier: SemanticFrontier;
  readonly live_projection_digest: string;
  readonly live_version: string;
}

export interface AgentDocumentView {
  readonly document_id: string;
  readonly title: string | null;
  readonly text: string | null;
  readonly text_length: number;
}

export interface AgentViewProjection {
  readonly actor_id: string;
  readonly documents: readonly AgentDocumentView[];
  readonly citations: readonly CitationProjection[];
  readonly conflicts: readonly ConflictProjection[];
}

export interface ProjectionSet {
  readonly workspace_status: WorkspaceStatusProjection;
  readonly documents: readonly DocumentProjection[];
  readonly citations: readonly CitationProjection[];
  readonly conflicts: readonly ConflictProjection[];
  readonly allowed_actions: readonly string[];
  readonly agent_view: AgentViewProjection;
  readonly anchor_projection_digest: string;
  readonly accepted_projection_digest: string;
  readonly canonical_full_view_digest: string;
  readonly agent_view_response_digest: string;
}

export function buildProjections(input: ProjectionInput): ProjectionSet {
  const validation = validateSemanticLog(input.semantic_log);
  if (!validation.ok) {
    throw new Error(`cannot rebuild projections from invalid semantic log: ${validation.issues.map((item) => item.code).join(",")}`);
  }

  const identityDocuments = [...input.collaborative.documents]
    .map((document) => ({
      document_id: document.document_id,
      title: document.title ?? null,
      text: document.text,
      text_length: document.text.length
    }))
    .sort((left, right) => left.document_id.localeCompare(right.document_id));
  const documents = identityDocuments.map((document) => ({
    ...document,
    text: input.capability.can_read_content ? document.text : null
  }));
  const outcomes = input.semantic_log.filter(
    (record): record is OutcomeLogRecord => record.record_type === "outcome"
  );
  const citations = buildCitationProjection(outcomes);
  const conflicts = buildConflictProjection(outcomes);
  const anchor_projection_digest = domainHash("ucf-yjs.anchor_projection.v1", [...citations] as unknown as JsonObject[]);
  const identityProjection = {
    workspace_id: input.collaborative.workspace_id,
    documents: identityDocuments,
    citations: [...citations],
    conflicts: [...conflicts],
    reducer_version: input.reducer_version
  };
  const live_projection_digest = domainHash("ucf-yjs.live_projection.v1", identityProjection as unknown as JsonObject);
  const accepted_projection_digest = domainHash("ucf-yjs.accepted_projection.v1", {
    ...identityProjection,
    semantic_frontier: { ...validation.frontier }
  } as unknown as JsonObject);
  const canonical_full_view_digest = domainHash("ucf-yjs.canonical_full_view.v1", {
    ...identityProjection,
    semantic_frontier: { ...validation.frontier }
  } as unknown as JsonObject);
  const live_version = domainHash("ucf-yjs.live.v1", {
    workspace_id: input.collaborative.workspace_id,
    reducer_version: input.reducer_version,
    live_projection_digest,
    semantic_frontier: { ...validation.frontier }
  } as unknown as JsonObject);
  const workspace_status: WorkspaceStatusProjection = {
    workspace_id: input.collaborative.workspace_id,
    reducer_version: input.reducer_version,
    document_count: documents.length,
    citation_count: citations.length,
    conflict_count: conflicts.length,
    semantic_frontier: validation.frontier,
    live_projection_digest,
    live_version
  };
  const allowed_actions = allowedActions(input.capability);
  const agent_view = buildAgentView(input.capability, documents, citations, conflicts);
  const agent_view_response_digest = domainHash("ucf-yjs.agent_view_response.v1", {
    workspace_status,
    allowed_actions: [...allowed_actions],
    agent_view
  } as unknown as JsonObject);

  return {
    workspace_status,
    documents,
    citations,
    conflicts,
    allowed_actions,
    agent_view,
    anchor_projection_digest,
    accepted_projection_digest,
    canonical_full_view_digest,
    agent_view_response_digest
  };
}

function buildCitationProjection(outcomes: readonly OutcomeLogRecord[]): readonly CitationProjection[] {
  const citations = new Map<string, CitationProjection>();
  for (const record of outcomes) {
    if (record.outcome.outcome !== "committed") {
      continue;
    }
    for (const event of record.outcome.events) {
      if (event.type !== "citation.upsert" || typeof event.citation_id !== "string" || typeof event.document_id !== "string") {
        continue;
      }
      citations.set(event.citation_id, {
        citation_id: event.citation_id,
        document_id: event.document_id,
        status: typeof event.status === "string" ? event.status : "active",
        range: readRange(event.range)
      });
    }
  }
  return [...citations.values()].sort((left, right) => left.citation_id.localeCompare(right.citation_id));
}

function buildConflictProjection(outcomes: readonly OutcomeLogRecord[]): readonly ConflictProjection[] {
  return outcomes
    .filter((record) => record.outcome.outcome === "conflict")
    .map((record) => ({
      command_id: record.command_id,
      code: record.outcome.code,
      diagnostics: record.outcome.diagnostics
    }))
    .sort((left, right) => left.command_id.localeCompare(right.command_id));
}

function buildAgentView(
  capability: CapabilityContext,
  documents: readonly DocumentProjection[],
  citations: readonly CitationProjection[],
  conflicts: readonly ConflictProjection[]
): AgentViewProjection {
  const limit = capability.max_agent_items ?? 50;
  return {
    actor_id: capability.actor_id,
    documents: documents.slice(0, limit).map((document) => ({
      document_id: document.document_id,
      title: document.title,
      text: document.text,
      text_length: document.text_length
    })),
    citations: citations.slice(0, limit),
    conflicts: conflicts.slice(0, limit)
  };
}

function allowedActions(capability: CapabilityContext): readonly string[] {
  const actions: string[] = ["workspace.read"];
  if (capability.can_write) {
    actions.push("document.replace_range", "citation.activate");
  }
  if (capability.can_accept) {
    actions.push("checkpoint.create", "citation.accept_current");
  }
  return actions.sort();
}

function readRange(value: unknown): { readonly start: number; readonly end: number } | null {
  if (
    typeof value === "object" &&
    value !== null &&
    !Array.isArray(value) &&
    typeof (value as { start?: unknown }).start === "number" &&
    typeof (value as { end?: unknown }).end === "number"
  ) {
    const start = (value as { start: number }).start;
    const end = (value as { end: number }).end;
    if (Number.isSafeInteger(start) && Number.isSafeInteger(end)) {
      return { start, end };
    }
  }
  return null;
}
