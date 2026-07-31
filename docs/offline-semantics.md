# Offline Semantics

UCF-Yjs separates offline draft document edits from semantic domain commands.

## Draft Document Edits

Draft document edits may be represented as Yjs text updates while a client is
offline. When updates exchange later, Yjs convergence determines live document
structure only.

Draft convergence does not accept citations, create checkpoints, or authorize
semantic transitions.

## Semantic Commands

Semantic commands require processor confirmation before becoming final:

- `citation.activate`
- `citation.accept_current`
- `citation.deactivate`
- `checkpoint.create`
- capability-changing commands

Queued semantic commands may be stored locally as pending, but they become
`committed`, `rejected`, or `conflict` only after the command processor validates
current state and appends a durable outcome.

## Speculative States

Clients may display speculative local state, but it must be labeled as pending
and excluded from accepted checkpoint identity. A speculative command without a
durable outcome is not semantic authority.

## Stale Observation

Commands that depend on observed live state include `observed.live_version` or
`observed.checkpoint_id`. If current state no longer matches the observation,
the processor returns `UCFY_CONFLICT_STALE_OBSERVATION` unless the command is
declared observation-independent.

## Raw Editor Transaction Policy

MVP routes editor edits through `document.replace_range`. Trusted editor
bindings may later mirror lower-level Yjs transactions only if they attach actor
metadata, create command records, produce outcome records, and run reducer
classification. Raw editor mutations cannot bypass semantic logging before a
checkpoint.

## Recovery

If provider state contains a Yjs update but the corresponding semantic command
or outcome is missing, the system returns `UCFY_RECOVERY_REQUIRED` or rebuilds
from a documented recovery path. It must not silently treat the update as an
accepted semantic command.

## Forward-Only Checkpoint Restore

Checkpoint restore does not rewind active CRDT history. Supported operations
are `checkpoint.open_readonly`, `checkpoint.fork`, and `checkpoint.reapply`.
