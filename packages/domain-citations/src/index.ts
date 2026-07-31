import { domainHash, type JsonObject } from "../../protocol/src/index.js";

export const domainCitationsPackage = {
  name: "domain-citations",
  responsibility: "citation reducer and evidence classification"
} as const;

export type CitationStatus = "valid" | "changed_unaccepted" | "missing" | "ambiguous" | "inactive";

export interface CitationState {
  readonly citation_id: string;
  readonly document_id: string;
  readonly start: number;
  readonly end: number;
  readonly boundary: "left" | "right";
  readonly accepted_text: string;
  readonly accepted_evidence_hash: string;
  readonly status: CitationStatus;
}

export interface MutableCitationState {
  citation_id: string;
  document_id: string;
  start: number;
  end: number;
  boundary: "left" | "right";
  accepted_text: string;
  accepted_evidence_hash: string;
  status: CitationStatus;
}

export function evidenceHash(documentId: string, text: string): string {
  return domainHash("ucf-yjs.evidence.v1", { document_id: documentId, text });
}

export function createCitation(input: {
  readonly citation_id: string;
  readonly document_id: string;
  readonly text: string;
  readonly start: number;
  readonly end: number;
  readonly boundary?: "left" | "right";
}): MutableCitationState {
  const accepted_text = input.text.slice(input.start, input.end);
  return {
    citation_id: input.citation_id,
    document_id: input.document_id,
    start: input.start,
    end: input.end,
    boundary: input.boundary ?? "right",
    accepted_text,
    accepted_evidence_hash: evidenceHash(input.document_id, accepted_text),
    status: "valid"
  };
}

export function adjustCitationForReplace(
  citation: MutableCitationState,
  replaceStart: number,
  replaceEnd: number,
  insertedLength: number
): void {
  const removedLength = replaceEnd - replaceStart;
  const delta = insertedLength - removedLength;
  if (replaceEnd <= citation.start) {
    citation.start += delta;
    citation.end += delta;
    return;
  }
  if (replaceStart >= citation.end) {
    return;
  }
  citation.end = Math.max(citation.start, citation.end + delta);
}

export function classifyCitation(citation: MutableCitationState, documentText: string | undefined): CitationStatus {
  if (citation.status === "inactive") {
    return "inactive";
  }
  if (documentText === undefined || citation.start < 0 || citation.end > documentText.length || citation.start >= citation.end) {
    citation.status = "missing";
    return citation.status;
  }
  citation.status = documentText.slice(citation.start, citation.end) === citation.accepted_text ? "valid" : "changed_unaccepted";
  return citation.status;
}

export function acceptCurrentEvidence(citation: MutableCitationState, documentText: string): void {
  const current = documentText.slice(citation.start, citation.end);
  citation.accepted_text = current;
  citation.accepted_evidence_hash = evidenceHash(citation.document_id, current);
  citation.status = "valid";
}

export function citationEvent(citation: CitationState): JsonObject {
  return {
    type: "citation.upsert",
    citation_id: citation.citation_id,
    document_id: citation.document_id,
    status: citation.status,
    range: { start: citation.start, end: citation.end },
    accepted_evidence_hash: citation.accepted_evidence_hash,
    boundary: citation.boundary
  };
}
