import test from "node:test";
import assert from "node:assert/strict";

import {
  CheckpointStore,
  createCheckpointManifest,
  documentDigest,
  validateCheckpointManifest,
  type CheckpointInput
} from "../packages/checkpoint-store/src/index.js";
import { COMMAND_SCHEMA_VERSION, type CommandEnvelope } from "../packages/protocol/src/index.js";
import { buildProjections, type CollaborativeDocument } from "../packages/projections/src/index.js";
import { SemanticLog } from "../packages/semantic-log/src/index.js";

function command(): CommandEnvelope {
  return {
    schema_version: COMMAND_SCHEMA_VERSION,
    command_id: "cmd-1",
    idempotency_key: "idem-1",
    actor: { actor_id: "actor-1", kind: "agent" },
    workspace_id: "ws-1",
    operation: "citation.activate",
    target: { kind: "document", document_id: "doc-1" },
    payload: { handle: "AUTH-ROTATE" }
  };
}

function checkpointInput(documents: readonly CollaborativeDocument[], providerSnapshotRef?: string): CheckpointInput {
  const log = new SemanticLog();
  log.append(command(), {
    outcome: "committed",
    code: "UCFY_OK",
    previous_live_version: null,
    new_live_version: "sha256:" + "1".repeat(64)
  });
  const projections = buildProjections({
    collaborative: { workspace_id: "ws-1", documents },
    semantic_log: log.snapshot(),
    reducer_version: "reducer.v1",
    capability: { actor_id: "actor-1", can_read_content: true, can_write: true, can_accept: true }
  });
  return {
    workspace_id: "ws-1",
    parent_checkpoint_id: null,
    semantic_frontier: projections.workspace_status.semantic_frontier,
    documents,
    anchor_projection_digest: projections.anchor_projection_digest,
    accepted_projection_digest: projections.accepted_projection_digest,
    collaborative_schema_version: "collab.v1",
    domain_schema_version: "domain.v1",
    reducer_version: "reducer.v1",
    policy: { retention: "keep", acceptance: "manual" },
    ...(providerSnapshotRef === undefined ? {} : { provider_snapshot_ref: providerSnapshotRef })
  };
}

test("checkpoint reload reproduces checkpoint ID", () => {
  const documents = [{ document_id: "doc-1", title: "A", text: "Alpha beta" }];
  const store = new CheckpointStore();
  const saved = store.save(checkpointInput(documents));
  const reloaded = new CheckpointStore(store.snapshot());
  const opened = reloaded.openReadonly(saved.checkpoint_id);
  const rebuilt = createCheckpointManifest(checkpointInput(documents));

  assert.equal(opened.mode, "readonly");
  assert.equal(opened.manifest.checkpoint_id, saved.checkpoint_id);
  assert.equal(rebuilt.checkpoint_id, saved.checkpoint_id);
});

test("different actor capabilities do not change checkpoint ID", () => {
  const documents = [{ document_id: "doc-1", title: "A", text: "Alpha beta" }];
  const log = new SemanticLog();
  log.append(command(), {
    outcome: "committed",
    code: "UCFY_OK",
    previous_live_version: null,
    new_live_version: "sha256:" + "1".repeat(64)
  });
  const readable = buildProjections({
    collaborative: { workspace_id: "ws-1", documents },
    semantic_log: log.snapshot(),
    reducer_version: "reducer.v1",
    capability: { actor_id: "reader", can_read_content: true, can_write: true, can_accept: true }
  });
  const redacted = buildProjections({
    collaborative: { workspace_id: "ws-1", documents },
    semantic_log: log.snapshot(),
    reducer_version: "reducer.v1",
    capability: { actor_id: "redacted", can_read_content: false, can_write: false, can_accept: false }
  });

  assert.equal(readable.accepted_projection_digest, redacted.accepted_projection_digest);
  const left = createCheckpointManifest({
    ...checkpointInput(documents),
    semantic_frontier: readable.workspace_status.semantic_frontier,
    anchor_projection_digest: readable.anchor_projection_digest,
    accepted_projection_digest: readable.accepted_projection_digest
  });
  const right = createCheckpointManifest({
    ...checkpointInput(documents),
    semantic_frontier: redacted.workspace_status.semantic_frontier,
    anchor_projection_digest: redacted.anchor_projection_digest,
    accepted_projection_digest: redacted.accepted_projection_digest
  });
  assert.equal(left.checkpoint_id, right.checkpoint_id);
});

test("altered accepted document content changes checkpoint ID", () => {
  const left = createCheckpointManifest(checkpointInput([{ document_id: "doc-1", title: "A", text: "Alpha beta" }]));
  const right = createCheckpointManifest(checkpointInput([{ document_id: "doc-1", title: "A", text: "Changed" }]));

  assert.notEqual(left.checkpoint_id, right.checkpoint_id);
  assert.notEqual(
    documentDigest({ document_id: "doc-1", title: "A", text: "Alpha beta" }),
    documentDigest({ document_id: "doc-1", title: "A", text: "Changed" })
  );
});

test("provider snapshot reference does not affect checkpoint identity", () => {
  const documents = [{ document_id: "doc-1", title: "A", text: "Alpha beta" }];
  const withoutSnapshot = createCheckpointManifest(checkpointInput(documents));
  const withSnapshot = createCheckpointManifest(checkpointInput(documents, "provider-local:snapshot-1"));

  assert.equal(withSnapshot.provider_snapshot_ref, "provider-local:snapshot-1");
  assert.equal(withSnapshot.checkpoint_id, withoutSnapshot.checkpoint_id);
});

test("checkpoint reload rejects tampered manifest identity", () => {
  const manifest = createCheckpointManifest(checkpointInput([{ document_id: "doc-1", title: "A", text: "Alpha beta" }]));
  const tampered = {
    ...manifest,
    accepted_projection_digest: "sha256:" + "8".repeat(64)
  };

  assert.equal(validateCheckpointManifest(manifest), true);
  assert.equal(validateCheckpointManifest(tampered), false);
  assert.throws(() => new CheckpointStore([tampered]));
});

test("open readonly, fork, and reapply are forward-only plans", () => {
  const documents = [{ document_id: "doc-1", title: "A", text: "Alpha beta" }];
  const store = new CheckpointStore();
  const saved = store.save(checkpointInput(documents));
  const readonly = store.openReadonly(saved.checkpoint_id);
  const fork = store.fork(saved.checkpoint_id, "ws-fork");
  const reapply = store.reapply(saved.checkpoint_id, "ws-current");

  assert.equal(readonly.mode, "readonly");
  assert.equal(fork.parent_checkpoint_id, saved.checkpoint_id);
  assert.deepEqual(fork.documents, documents);
  assert.equal(reapply.requires_processor, true);
  assert.equal(reapply.semantic_frontier.outcome_hash, saved.semantic_frontier.outcome_hash);
});
