# Authority Planes

UCF-Yjs separates authority by fact type. No single `Y.Doc` owns the whole
system truth.

| Plane | Owns | Does Not Own |
| --- | --- | --- |
| Collaborative data | Current convergent document text, Yjs relative anchors, live shared metadata | Submitted intent, durable audit, semantic acceptance |
| Durable semantic log | Command envelopes, outcome envelopes, actor attribution, idempotency, workspace ordering, outcome hash chain | Current rendered text or provider snapshots |
| Projection | Citation status, allowed actions, overlays, reports, agent views, reverse indexes | Permanent truth or audit records |
| Acceptance | Content-addressed accepted checkpoint manifests at explicit frontiers | Current live state after later edits |
| Provider | Persistence, synchronization, update exchange, optional provider snapshots | Domain meaning, authorization, checkpoint identity |
| Awareness | Presence, cursors, connection state | Persisted authority |

## Plane Rules

- Collaborative data may contain convenience references to commands, outcomes,
  and checkpoints, but those references are projections.
- The semantic log is append-only authority for typed intent and outcomes.
- Projection state is always rebuildable from Yjs state, semantic log,
  reducer versions, and capability context.
- Acceptance is explicit. A valid anchor and converged text do not imply
  accepted evidence.
- Provider snapshots may accelerate reload but do not define acceptance.
- Awareness must be omitted from live-version and checkpoint identity.

## One Logical Processor

MVP semantic ordering is handled by one logical command processor per workspace.
It may run inside tests, CLI, or a local service. Replicated semantic command
claiming is deferred until deterministic ownership and ordering are specified.

## Public And Internal APIs

Public MVP APIs accept typed command envelopes and return typed outcome
envelopes or deterministic projections. Internal provider APIs may exchange raw
Yjs updates, but agents are not required to read or submit raw CRDT bytes for
normal citation workflows.
