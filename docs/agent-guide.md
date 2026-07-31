# UCF-Yjs Agent Guide

This guide is for AI agents and automated clients that submit commands
against a UCF-Yjs workspace — the protocol has first-class support for this:
actors carry a `"kind": "agent"` field, and `agent_view.get` exists
specifically to return a capability-filtered view suited to non-human
callers.

If you're embedding UCF-Yjs into an application rather than acting as a
client, read the [User Guide](user-guide.md) instead.

## The contract, in one paragraph

Every semantic action is a typed command that gets exactly one deterministic
outcome — `committed`, `rejected`, or `conflict` — with a stable `code`.
Nothing about citation validity is inferred from converged text alone: Yjs
convergence is a structural fact, not semantic acceptance. You must never
treat `changed_unaccepted`, `missing`, or `ambiguous` citations as valid
evidence, and you must never treat a raw Yjs update as if it were a
confirmed command outcome.

In M1, `status.get` and `agent_view.get` are observations rather than semantic
mutations. Use them to refresh state, but do not expect them to advance
`workspace_sequence`, semantic frontier identity, `live_version`, or checkpoint
identity.

## Non-negotiable rules

- **CRDT convergence is not acceptance.** Two replicas agreeing on text
  tells you the text converged — it does not tell you a citation over that
  text is still valid. Always check via `citation.resolve` /
  `agent_view.get` / `status.get`, never by inspecting Yjs state directly.
- **Don't read or submit raw Yjs updates for normal citation work.** The
  public contract is command/outcome envelopes. Raw CRDT bytes are provider
  material.
- **Never accept changed evidence implicitly.** `changed_unaccepted`,
  `missing`, and `ambiguous` citations require an explicit
  `citation.accept_current`, a fresh `citation.activate`, or an explicit
  `citation.deactivate` — never silently reinterpret them as still valid.
- **Multiple candidate targets stay ambiguous.** Don't guess a "best" match
  when more than one legitimate candidate exists — surface the ambiguity.
- **Route edits through `document.replace_range`.** Don't bypass the
  semantic log with lower-level Yjs transactions; if you ever do mirror raw
  transactions, they must carry actor metadata and produce real command/
  outcome records — this is not currently a supported agent workflow in the
  MVP.
- **Provider snapshots are not checkpoints.** Don't treat a fast local
  reload as evidence anything was accepted.
- **Checkpoint restore is forward-only.** Don't attempt to rewind live Yjs
  history; use `openReadonly`, `fork`, or `reapply` semantics instead, and
  expect that a checkpoint manifest never changes after creation.
- **Respect capability filtering.** If your capability context has
  `can_read_content: false`, don't try to work around that by requesting
  raw document state through another path — the redaction is intentional
  (see [`docs/security.md`](security.md)).
- **Idempotency keys are retry intent, not a version bump.** Reuse the same
  `idempotency_key` only when retrying the *same* logical request. Changing
  the payload under a reused key is a client bug and returns
  `UCFY_CONFLICT_IDEMPOTENCY_PAYLOAD` — mint a new key for a genuinely new
  request instead.
- **Reads do not create acceptance.** `status.get` and `agent_view.get` can
  show changed or missing evidence, but the semantic frontier does not move
  until a mutating command commits.

## Command envelope checklist

Before submitting, make sure your command has:

- `schema_version`: `"ucf-yjs.command.v1"`
- `command_id`: unique per submission attempt
- `idempotency_key`: stable across retries of the *same* intent
- `actor`: include `"kind": "agent"` and a stable `actor_id`
- `workspace_id`, `operation`, `target`, `payload`
- `observed.live_version` or `observed.checkpoint_id` on any command that
  should fail rather than apply against state you haven't re-checked

## Outcome codes and how to react

| Code | Meaning | Agent response |
| --- | --- | --- |
| `UCFY_OK` | Committed cleanly | Proceed |
| `UCFY_REJECTED_SCHEMA` / `UCFY_REJECTED_UNSUPPORTED_SCHEMA` | Malformed or unsupported command | Fix the envelope, don't retry as-is |
| `UCFY_REJECTED_PERMISSION` | Capability check failed | Don't retry with the same capability context; escalate or use a different actor |
| `UCFY_CONFLICT_STALE_OBSERVATION` | `observed.*` no longer matches current state | Re-fetch current state, then resubmit with fresh `observed` values |
| `UCFY_CONFLICT_IDEMPOTENCY_PAYLOAD` | Same key, different payload | Mint a new `idempotency_key` |
| `UCFY_CONFLICT_INVALID_TRANSITION` | Lifecycle transition not allowed from current state | Re-check state before choosing the next command |
| `UCFY_CONFLICT_AMBIGUOUS_REFERENCE` | Multiple candidates match | Surface to the human/caller — do not pick one automatically |
| `UCFY_CONFLICT_CHANGED_EVIDENCE` | Evidence changed since acceptance (blocks `checkpoint.create`) | Resolve/accept the affected citation(s) first, then retry the checkpoint |
| `UCFY_CONFLICT_MISSING_TARGET` | Target not found | Don't fabricate a location; report missing |
| `UCFY_RECOVERY_REQUIRED` | Provider state has an update with no matching semantic record | Follow the documented recovery path — don't treat the update as accepted |

## Recommended interaction pattern

1. Fetch current state with `status.get` or `agent_view.get` before acting —
   don't act from stale assumptions.
2. Submit the command with `observed.live_version` set from that fresh read.
3. On `committed`, use `new_live_version` from the outcome for your next
   `observed` value — don't re-derive it from raw Yjs state.
4. On any `conflict`, re-read state and choose the next action based on the
   table above — don't retry the identical command hoping for a different
   result.
5. Before `checkpoint.create`, make sure every active citation you're
   responsible for is `valid` (via `citation.resolve`) — otherwise expect
   `UCFY_CONFLICT_CHANGED_EVIDENCE`.
6. Use `agent_view.get` for anything you'll show to another automated
   consumer, so capability filtering is applied consistently.

## Example session (adapted from the project's own end-to-end test)

```json
{"schema_version":"ucf-yjs.command.v1","command_id":"cmd-workspace","idempotency_key":"idem-cmd-workspace","actor":{"actor_id":"actor-1","kind":"agent"},"workspace_id":"ws-1","operation":"workspace.create","target":{"kind":"workspace"},"payload":{"workspace_id":"ws-1"}}
{"schema_version":"ucf-yjs.command.v1","command_id":"cmd-doc","idempotency_key":"idem-cmd-doc","actor":{"actor_id":"actor-1","kind":"agent"},"workspace_id":"ws-1","operation":"document.create","target":{"kind":"document","document_id":"doc-1"},"payload":{"document_id":"doc-1","text":"Alpha beta"}}
{"schema_version":"ucf-yjs.command.v1","command_id":"cmd-cite","idempotency_key":"idem-cmd-cite","actor":{"actor_id":"actor-1","kind":"agent"},"workspace_id":"ws-1","operation":"citation.activate","target":{"kind":"document","document_id":"doc-1"},"payload":{"citation_id":"c1","start":0,"end":5,"expected_text":"Alpha"}}
{"schema_version":"ucf-yjs.command.v1","command_id":"cmd-resolve","idempotency_key":"idem-cmd-resolve","actor":{"actor_id":"actor-1","kind":"agent"},"workspace_id":"ws-1","operation":"citation.resolve","target":{"kind":"citation","citation_id":"c1"},"payload":{"citation_id":"c1"}}
```

If that last `citation.resolve` reports `changed_unaccepted` (because the
underlying text moved), the correct next step is `citation.accept_current`
after confirming the new text is right — not re-activating over it and not
proceeding straight to `checkpoint.create` (which would return
`UCFY_CONFLICT_CHANGED_EVIDENCE`).

Piped through the headless transport:

```bash
cat commands.jsonl | node dist/packages/cli/src/index.js > outcomes.jsonl
```

## See also

- [User Guide](user-guide.md) — the same protocol from an embedding
  developer's point of view
- [`docs/protocol.md`](protocol.md) — full envelope reference
- [`docs/offline-semantics.md`](offline-semantics.md) — what's allowed
  while disconnected
- [`docs/security.md`](security.md) — capability model in full
- [`docs/TRD.md`](TRD.md) — the non-negotiable invariants this guide is
  derived from
