# M1-0001 Release Baselines

## Decision

Record the M1 release baselines as documentation-only local release-preparation
artifacts, and start implementation work from the current UCF-Yjs `main` head
on `codex/ucf-yjs-m1-durable-runtime`.

## Alternatives

- Create local annotated tags immediately.
- Treat the current UCF-Yjs head as the only M0 compatibility baseline.
- Stop because current heads are newer than the bundle's named merge commits.

## Reason

The M1 kickoff authorizes local implementation but explicitly excludes remote
publication and requires baseline recording before code changes. The bundle
names immutable M0/Foundation merge commits, and the actual local heads include
post-M0 documentation or projection-output follow-up commits. Recording both
sets preserves compatibility evidence without mislabeling the current work as
rebuilding M0.

## Canonical Or Compatibility Effect

No canonical bytes, command outcomes, semantic frontier values, checkpoint
identity fields, or provider bytes change in M1.1.

## Migration Effect

No migration is introduced in M1.1. Later migration and conformance tests may
refer to the recorded M0 baseline commits and test counts.

## Future Extension Point

M1.2 will convert the recorded schema/profile inventory into a deterministic
registry with reader/writer compatibility and migration tests.
