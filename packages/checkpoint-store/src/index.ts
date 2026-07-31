import { domainHash, type JsonObject } from "../../protocol/src/index.js";
import type { CollaborativeDocument } from "../../projections/src/index.js";
import type { SemanticFrontier } from "../../semantic-log/src/index.js";

export const CHECKPOINT_SCHEMA_VERSION = "ucf-yjs.checkpoint.v1";

export const checkpointStorePackage = {
  name: "checkpoint-store",
  responsibility: "content-addressed accepted checkpoint manifests"
} as const;

export interface CheckpointPolicy {
  readonly retention: "keep" | "discard_provider_snapshot";
  readonly acceptance: "manual" | "processor";
}

export interface DocumentDigest {
  readonly document_id: string;
  readonly digest: string;
}

export interface CheckpointManifest {
  readonly schema_version: typeof CHECKPOINT_SCHEMA_VERSION;
  readonly checkpoint_id: string;
  readonly workspace_id: string;
  readonly parent_checkpoint_id: string | null;
  readonly semantic_frontier: SemanticFrontier;
  readonly document_digests: readonly DocumentDigest[];
  readonly anchor_projection_digest: string;
  readonly accepted_projection_digest: string;
  readonly collaborative_schema_version: string;
  readonly domain_schema_version: string;
  readonly reducer_version: string;
  readonly policy: CheckpointPolicy;
  readonly provider_snapshot_ref?: string;
}

export interface CheckpointInput {
  readonly workspace_id: string;
  readonly parent_checkpoint_id: string | null;
  readonly semantic_frontier: SemanticFrontier;
  readonly documents: readonly CollaborativeDocument[];
  readonly anchor_projection_digest: string;
  readonly accepted_projection_digest: string;
  readonly collaborative_schema_version: string;
  readonly domain_schema_version: string;
  readonly reducer_version: string;
  readonly policy: CheckpointPolicy;
  readonly provider_snapshot_ref?: string;
}

export interface ReadonlyCheckpoint {
  readonly mode: "readonly";
  readonly manifest: CheckpointManifest;
}

export interface ForkPlan {
  readonly mode: "fork";
  readonly source_checkpoint_id: string;
  readonly workspace_id: string;
  readonly parent_checkpoint_id: string;
  readonly documents: readonly CollaborativeDocument[];
}

export interface ReapplyPlan {
  readonly mode: "reapply";
  readonly checkpoint_id: string;
  readonly target_workspace_id: string;
  readonly requires_processor: true;
  readonly semantic_frontier: SemanticFrontier;
}

export class CheckpointStore {
  private readonly manifests = new Map<string, CheckpointManifest>();
  private readonly documentsByCheckpoint = new Map<string, readonly CollaborativeDocument[]>();

  constructor(manifests: readonly CheckpointManifest[] = [], documentsByCheckpoint: ReadonlyMap<string, readonly CollaborativeDocument[]> = new Map()) {
    for (const manifest of manifests) {
      if (!validateCheckpointManifest(manifest)) {
        throw new Error(`invalid checkpoint manifest: ${manifest.checkpoint_id}`);
      }
      this.manifests.set(manifest.checkpoint_id, structuredClone(manifest));
    }
    for (const [checkpointId, documents] of documentsByCheckpoint.entries()) {
      this.documentsByCheckpoint.set(checkpointId, structuredClone(documents));
    }
  }

  save(input: CheckpointInput): CheckpointManifest {
    const manifest = createCheckpointManifest(input);
    this.manifests.set(manifest.checkpoint_id, structuredClone(manifest));
    this.documentsByCheckpoint.set(manifest.checkpoint_id, structuredClone(input.documents));
    return structuredClone(manifest);
  }

  openReadonly(checkpointId: string): ReadonlyCheckpoint {
    const manifest = this.requireManifest(checkpointId);
    return { mode: "readonly", manifest: structuredClone(manifest) };
  }

  fork(checkpointId: string, workspaceId: string): ForkPlan {
    const manifest = this.requireManifest(checkpointId);
    const documents = this.documentsByCheckpoint.get(checkpointId) ?? [];
    return {
      mode: "fork",
      source_checkpoint_id: checkpointId,
      workspace_id: workspaceId,
      parent_checkpoint_id: manifest.checkpoint_id,
      documents: structuredClone(documents)
    };
  }

  reapply(checkpointId: string, targetWorkspaceId: string): ReapplyPlan {
    const manifest = this.requireManifest(checkpointId);
    return {
      mode: "reapply",
      checkpoint_id: checkpointId,
      target_workspace_id: targetWorkspaceId,
      requires_processor: true,
      semantic_frontier: structuredClone(manifest.semantic_frontier)
    };
  }

  snapshot(): readonly CheckpointManifest[] {
    return [...this.manifests.values()].map((manifest) => structuredClone(manifest));
  }

  private requireManifest(checkpointId: string): CheckpointManifest {
    const manifest = this.manifests.get(checkpointId);
    if (manifest === undefined) {
      throw new Error(`unknown checkpoint: ${checkpointId}`);
    }
    return manifest;
  }
}

export function createCheckpointManifest(input: CheckpointInput): CheckpointManifest {
  const document_digests = [...input.documents]
    .map((document) => ({
      document_id: document.document_id,
      digest: documentDigest(document)
    }))
    .sort((left, right) => left.document_id.localeCompare(right.document_id));
  const identity = {
    schema_version: CHECKPOINT_SCHEMA_VERSION,
    workspace_id: input.workspace_id,
    parent_checkpoint_id: input.parent_checkpoint_id,
    semantic_frontier: { ...input.semantic_frontier },
    document_digests,
    anchor_projection_digest: input.anchor_projection_digest,
    accepted_projection_digest: input.accepted_projection_digest,
    collaborative_schema_version: input.collaborative_schema_version,
    domain_schema_version: input.domain_schema_version,
    reducer_version: input.reducer_version,
    policy: input.policy
  } as const;
  const checkpoint_id = checkpointIdentity(identity);
  return {
    ...identity,
    checkpoint_id,
    ...(input.provider_snapshot_ref === undefined ? {} : { provider_snapshot_ref: input.provider_snapshot_ref })
  };
}

export function validateCheckpointManifest(manifest: CheckpointManifest): boolean {
  const { checkpoint_id: _checkpointId, provider_snapshot_ref: _providerSnapshotRef, ...identity } = manifest;
  return checkpointIdentity(identity) === manifest.checkpoint_id;
}

export function documentDigest(document: CollaborativeDocument): string {
  return domainHash("ucf-yjs.document.v1", {
    document_id: document.document_id,
    title: document.title ?? null,
    text: document.text
  });
}

function checkpointIdentity(identity: Omit<CheckpointManifest, "checkpoint_id" | "provider_snapshot_ref">): string {
  return domainHash("ucf-yjs.checkpoint.v1", identity as unknown as JsonObject);
}
