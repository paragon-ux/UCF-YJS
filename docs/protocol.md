# Protocol

The UCF-Yjs public protocol is command/outcome based. It is schema-versioned,
deterministic, and independent of provider internals.

## Command Envelope

```json
{
  "schema_version": "ucf-yjs.command.v1",
  "command_id": "uuid-or-stable-id",
  "idempotency_key": "client-stable-key",
  "actor": {
    "actor_id": "actor.local",
    "kind": "human",
    "display": "optional"
  },
  "workspace_id": "ws_123",
  "observed": {
    "live_version": "sha256:...",
    "checkpoint_id": "sha256:..."
  },
  "operation": "citation.activate",
  "target": {
    "kind": "document",
    "document_id": "doc_123"
  },
  "payload": {}
}
```

Rules:

- Commands are immutable once accepted by the processor.
- `command_id` identifies the submitted command.
- `idempotency_key` identifies a client retry intent.
- Duplicate `command_id` returns the original outcome.
- Duplicate `idempotency_key` with identical payload returns the original
  outcome.
- Duplicate `idempotency_key` with different payload returns
  `UCFY_CONFLICT_IDEMPOTENCY_PAYLOAD`.
- Commands requiring stale-state protection include `observed.live_version` or
  `observed.checkpoint_id`.
- Invalid commands return typed `rejected` outcomes and must not partially
  mutate collaborative or semantic state.

## Outcome Envelope

```json
{
  "schema_version": "ucf-yjs.outcome.v1",
  "command_id": "uuid-or-stable-id",
  "outcome": "committed",
  "code": "UCFY_OK",
  "workspace_sequence": 1,
  "previous_outcome_hash": "sha256:...",
  "outcome_hash": "sha256:...",
  "previous_live_version": "sha256:...",
  "new_live_version": "sha256:...",
  "affected_resources": [],
  "events": [],
  "allowed_actions": [],
  "diagnostics": []
}
```

Outcome categories:

- `committed`: command was applied and durably recorded.
- `rejected`: command was invalid or unauthorized before mutation.
- `conflict`: command was well-formed but semantically cannot commit against
  current state.

Stable initial codes:

- `UCFY_OK`
- `UCFY_REJECTED_SCHEMA`
- `UCFY_REJECTED_UNSUPPORTED_SCHEMA`
- `UCFY_REJECTED_PERMISSION`
- `UCFY_CONFLICT_STALE_OBSERVATION`
- `UCFY_CONFLICT_IDEMPOTENCY_PAYLOAD`
- `UCFY_CONFLICT_INVALID_TRANSITION`
- `UCFY_CONFLICT_AMBIGUOUS_REFERENCE`
- `UCFY_CONFLICT_CHANGED_EVIDENCE`
- `UCFY_CONFLICT_MISSING_TARGET`
- `UCFY_RECOVERY_REQUIRED`

## Semantic Log Ordering

For MVP, the processor assigns a monotonically increasing
`workspace_sequence`. Every durable outcome includes `previous_outcome_hash` and
`outcome_hash`. The latest sequence plus latest outcome hash is the semantic
frontier.

## Projection Rebuild

Projection rebuild inputs are:

```text
converged Yjs state
+ validated semantic log
+ reducer version
+ capability context
```

Projection outputs must be deterministic for the same inputs. Capability
filtering changes returned fields but never checkpoint identity.
