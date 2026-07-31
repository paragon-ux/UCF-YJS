# UCF-Yjs User Guide

This guide is for developers embedding UCF-Yjs in an application — someone
wiring up a collaborative editor, a citation UI, or a review workflow on top
of it.

If you're an AI agent issuing commands as a client rather than embedding the
library, read the [Agent Guide](agent-guide.md) instead — it covers the same
protocol with a focus on rules for unattended callers.

## The mental model: six authority planes

UCF-Yjs doesn't let any single `Y.Doc` own the whole system's truth. Instead:

| Plane | Owns | Does not own |
| --- | --- | --- |
| Collaborative data | Current convergent text, Yjs relative anchors, live shared metadata | Submitted intent, durable audit, semantic acceptance |
| Durable semantic log | Command/outcome envelopes, actor attribution, idempotency, workspace ordering, outcome hash chain | Current rendered text or provider snapshots |
| Projection | Citation status, allowed actions, overlays, reports, agent views | Permanent truth or audit records |
| Acceptance | Content-addressed accepted checkpoint manifests | Current live state after later edits |
| Provider | Persistence, sync, update exchange, optional snapshots | Domain meaning, authorization, checkpoint identity |
| Awareness | Presence, cursors, connection state | Persisted authority |

The practical upshot: convergence (Yjs agreeing on text) and correctness
(a citation still being valid evidence) are different questions, answered by
different planes. See [`docs/authority-planes.md`](authority-planes.md) for
the full rules.

## The command/outcome contract

Everything semantic goes through one logical **workspace processor** per
workspace, as typed commands:

```json
{
  "schema_version": "ucf-yjs.command.v1",
  "command_id": "uuid-or-stable-id",
  "idempotency_key": "client-stable-key",
  "actor": { "actor_id": "actor.local", "kind": "human", "display": "optional" },
  "workspace_id": "ws_123",
  "observed": { "live_version": "sha256:...", "checkpoint_id": "sha256:..." },
  "operation": "citation.activate",
  "target": { "kind": "document", "document_id": "doc_123" },
  "payload": {}
}
```

Every command gets exactly one deterministic outcome:

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

`outcome` is one of `committed`, `rejected`, or `conflict`. Full envelope
rules and the stable code list are in [`docs/protocol.md`](protocol.md).

### Idempotency, in practice

- Resubmitting the same `command_id` returns the original outcome — safe to
  retry a request you're not sure landed.
- A repeated `idempotency_key` with the *same* payload also replays the
  original outcome.
- A repeated `idempotency_key` with a *different* payload is a
  `UCFY_CONFLICT_IDEMPOTENCY_PAYLOAD` — the client changed its mind mid-retry
  and needs a fresh key.
- Include `observed.live_version` (or `observed.checkpoint_id`) on commands
  that shouldn't apply against stale state; a mismatch returns
  `UCFY_CONFLICT_STALE_OBSERVATION`.

## Core operations

| Operation | Does |
| --- | --- |
| `workspace.create` | Create a workspace |
| `document.create` | Create a document with initial text |
| `document.replace_range` | Apply a text edit through the semantic log (the routed path for editor edits) |
| `citation.activate` | Record a citation over an explicit range |
| `citation.resolve` | Classify a citation against current converged text |
| `citation.accept_current` | Explicitly accept current evidence as valid |
| `citation.deactivate` | Mark a citation inactive |
| `checkpoint.create` | Create an actor-neutral accepted checkpoint |
| `agent_view.get` | Return a capability-filtered view |
| `status.get` | Return workspace status |

### Citation lifecycle

`citation.resolve` (and the projections it feeds) classify each citation as:

- `valid` — the cited range still matches expected content.
- `changed_unaccepted` — text moved or diverged since acceptance; not valid
  evidence until explicitly re-accepted.
- `missing` — target range/content can't be found.
- `ambiguous` — more than one legitimate candidate exists.
- `inactive` — deactivated.

None of these transitions happen implicitly. `changed_unaccepted`,
`missing`, and `ambiguous` all require an explicit command
(`citation.accept_current`, a fresh `citation.activate`, or a deliberate
`citation.deactivate`) before they're treated as resolved.

## Checkpoints

`checkpoint.create` records an **actor-neutral** accepted frontier — a
content-addressed manifest of workspace identity, reducer version, semantic
frontier, document digests, and policy, deliberately excluding actor ID,
timestamps, and capability-filtered views (see
[`docs/checkpoint.md`](checkpoint.md) for the full identity body).

Before a checkpoint can be created, the processor resolves and classifies
every active citation against current converged state. Any
`changed_unaccepted`, `missing`, or `ambiguous` citation blocks checkpoint
creation with `UCFY_CONFLICT_CHANGED_EVIDENCE` until you resolve it.

Once created, a checkpoint supports **forward-only** restore via the
`CheckpointStore` API (not currently exposed as submittable commands):

- `openReadonly(checkpointId)` — inspect accepted state without touching the
  live workspace.
- `fork(checkpointId, workspaceId)` — plan a new workspace initialized from
  accepted state.
- `reapply(checkpointId, targetWorkspaceId)` — plan forward commands that
  move current live state toward accepted state.

There is no in-place rewind of live Yjs history, and a provider snapshot is
never itself a checkpoint.

## Providers

UCF-Yjs ships two providers, both implementing the same contract:

- `MemoryProvider` — in-process, useful for tests and multi-replica
  simulation (`connect`, `sync`, `disconnect`/`reconnect`, `flush` with
  duplicate/reorder options).
- `LocalProvider` — persists provider bytes plus an opaque processor
  authority snapshot to local storage, so a workspace can reload and
  reproduce checkpoint/projection state.

Provider snapshots accelerate reload; they are never accepted checkpoints
and never define semantic truth on their own. See
[`docs/provider-contract.md`](provider-contract.md).

## Offline and collaborative editing

Draft Yjs text edits can happen while a client is offline — when updates
exchange later, Yjs convergence determines live *text* only. It does **not**
accept citations, create checkpoints, or authorize any semantic transition.
Semantic commands (`citation.activate`, `citation.accept_current`,
`citation.deactivate`, `checkpoint.create`, capability-changing commands)
always require processor confirmation, online or not. See
[`docs/offline-semantics.md`](offline-semantics.md) for the full rules,
including how stale `observed.live_version` is handled and what happens if a
provider update arrives with no matching semantic command
(`UCFY_RECOVERY_REQUIRED` rather than silent acceptance).

## Capability model and agent views

Every command runs under a capability context:

```json
{ "actor_id": "actor-1", "can_read_content": true, "can_write": true, "can_accept": true }
```

`agent_view.get` and `status.get` responses are filtered by this context —
e.g. document text is omitted entirely when `can_read_content` is `false`.
Capability filtering changes what's returned, never checkpoint identity.
Full capability list in [`docs/security.md`](security.md).

## Headless JSONL transport

For scripted or out-of-process use, the `cli` package exposes `runJsonl`,
which takes newline-delimited command JSON and returns newline-delimited
outcome JSON, preserving already-committed results even if a later line is
malformed JSON:

```ts
import { runJsonl } from "./packages/cli/src/index.js";

const output = runJsonl(jsonlInput, processor, capability);
```

`main()` in the same module wires this to stdin/stdout for a headless
process. There's no published standalone binary yet — build the package and
invoke the compiled entry point directly, or call `runJsonl` from your own
Node process:

```bash
node dist/packages/cli/src/index.js < commands.jsonl > outcomes.jsonl
```

**Note:** when you call `processor.submit()` directly (embedding the
library), the result always includes `projections` alongside `outcome`. Over
the JSONL/CLI transport, the response body only includes a `projections`
field for `agent_view.get` and `status.get` — other operations return just
the `outcome` envelope, to keep routine output terse. If you need current
citation status after, say, `citation.resolve`, follow up with `status.get`
or `agent_view.get` over that transport.

## Where to go next

- [`docs/TRD.md`](TRD.md) — architecture decisions and non-negotiable
  invariants
- [`docs/protocol.md`](protocol.md) — full envelope and code reference
- [`docs/canonicalization.md`](canonicalization.md) — how digests are computed
- [`docs/checkpoint.md`](checkpoint.md) — checkpoint identity in full
- [`docs/security.md`](security.md) — capability model and data handling
