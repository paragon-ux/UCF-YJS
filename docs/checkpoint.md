# Checkpoints

Checkpoints are explicit accepted manifests. They are not provider snapshots,
raw Yjs state exports, or in-place CRDT rewind points.

## Manifest

```json
{
  "schema_version": "ucf-yjs.checkpoint.v1",
  "checkpoint_id": "sha256:...",
  "workspace_id": "ws_123",
  "domain": "citations",
  "domain_schema_version": "ucf-yjs.citations.v1",
  "reducer_version": "ucf-yjs.citations.reducer.v1",
  "parent_checkpoint_id": null,
  "live_version": "sha256:...",
  "semantic_frontier": {
    "workspace_sequence": 7,
    "outcome_chain_hash": "sha256:..."
  },
  "document_digests": [],
  "anchor_projection_digest": "sha256:...",
  "accepted_projection_digest": "sha256:...",
  "policy": {
    "retention": "metadata-only",
    "visibility": "private",
    "exportability": "metadata",
    "evidence_text_disclosure": "deny",
    "diagnostic_redaction": "required",
    "checkpoint_sharing": "private",
    "provider_backup": "local-private"
  },
  "provider_snapshot_ref": null,
  "verification": {
    "canonical_full_view_digest": "sha256:..."
  },
  "created_by": "actor.local",
  "created_at": "2026-07-31T00:00:00Z"
}
```

## Checkpoint Identity

`checkpoint_id` hashes this actor-neutral identity body:

```json
{
  "workspace_id": "ws_123",
  "domain": "citations",
  "domain_schema_version": "ucf-yjs.citations.v1",
  "reducer_version": "ucf-yjs.citations.reducer.v1",
  "parent_checkpoint_id": null,
  "semantic_frontier": {
    "workspace_sequence": 7,
    "outcome_chain_hash": "sha256:..."
  },
  "document_digests": [],
  "anchor_projection_digest": "sha256:...",
  "accepted_projection_digest": "sha256:...",
  "policy": {
    "retention": "metadata-only",
    "visibility": "private",
    "exportability": "metadata",
    "evidence_text_disclosure": "deny",
    "diagnostic_redaction": "required",
    "checkpoint_sharing": "private",
    "provider_backup": "local-private"
  }
}
```

Included:

- workspace identity;
- domain and reducer versions;
- parent checkpoint when present;
- semantic command frontier;
- document digests;
- anchor projection digest;
- actor-neutral accepted projection digest;
- policy fields that alter accepted-state meaning.

Excluded:

- capability-filtered agent views;
- actor ID and display fields;
- creation timestamp;
- awareness and presence;
- provider-specific snapshot IDs;
- connection state;
- caller display preferences;
- non-deterministic timestamps.

`verification.canonical_full_view_digest` is optional non-identity metadata over
a documented actor-neutral full view. Capability-filtered views may have their
own response digests, but those response digests never define checkpoint
identity.

## Forward-Only Restore

Supported checkpoint operations:

- `checkpoint.open_readonly`: inspect accepted state without mutating the live
  workspace.
- `checkpoint.fork`: create a new workspace initialized from accepted state.
- `checkpoint.reapply`: generate new forward commands that transform current
  live state toward accepted state.

Unsupported in MVP:

- in-place rewind of active Yjs history;
- treating provider snapshot restore as semantic acceptance;
- mutating a checkpoint manifest after creation.

## Acceptance Relationship

`citation.accept_current` updates accepted evidence through a command outcome.
`checkpoint.create` records an accepted frontier. Acceptance and checkpoint
creation are separate commands unless a future schema explicitly combines them.
