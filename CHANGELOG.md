# Changelog

## Unreleased

- Replace `docs/TRD.md` with the active long-term project plan.
- Record M1 as complete and merged, and make M2 editor/workbench the active
  planning milestone.
- Reserve `0.2.0-m1` as the proposed M1 release tag. This documentation change
  does not create the tag; create it from the resulting `main` commit after the
  documentation update lands.
- Adopt the milestone tag pattern `0.x.0-mN` for later milestone releases unless
  a future release decision changes it (for example, `0.3.0-m2`).

## 0.2.0-m1 (proposed, not yet tagged) — M1: durable local protocol runtime

- Add the schema/version registry (`schemas/registry.json`,
  `packages/protocol/src/schema-registry.ts`) covering command, outcome,
  frontier, observation log and response, processor snapshot, checkpoint,
  provider snapshot, workspace generation, citation, reducer, and
  canonicalization schemas.
- Separate observational reads from semantic identity: `status.get` and
  `agent_view.get` move onto semantic-frontier profile v2 and no longer advance
  workspace sequence, frontier identity, `live_version`, or checkpoint
  identity.
- Introduce the distinct `ucf-yjs.observation_response.v1` envelope with a
  required, canonical, verified `response_digest`; observation responses cannot
  be validated or persisted as semantic outcome-chain records.
- Add the versioned UCF-RS/UCF-Yjs behavioral conformance corpus
  (`ucf.behavior_fixtures.v1`), covering activation, evidence edits,
  changed/missing/ambiguous evidence, explicit acceptance, stale observation,
  idempotency, checkpoint gating, offline replay, recovery required, and
  divergence. UCF-Yjs and UCF-RS adapters pass independently.
- Add recoverable workspace generations with `prepared`, `material_written`,
  `validated`, `published`, and `committed` phases, authenticated phase history,
  direct-parent recovery lineage, and idempotent locked recovery.
- Recover valid manifest-before-pointer crash windows at the `published` and
  `committed` stages without making inspection or open paths mutate authority.
- Add one OS-backed writer lock per workspace (POSIX `flock` / Windows
  `msvcrt.locking` via a helper process), with immediate, bounded-wait,
  missing-helper, startup-failure, release, and crash-release behavior tested.
- Add the corruption fixture suite: malformed pointers and manifests, digest
  mismatch, truncated log, command without outcome, bad idempotency reference,
  checkpoint document issues, stale reducer snapshot, undecodable anchor,
  unsupported schema, and provider document drift all fail closed with typed
  results.
- Add the persistent named-workspace CLI/runtime: init, validate, command submit,
  status, agent view, recovery inspect/resolve, checkpoint operations, and
  provider-neutral export/import against real persisted state.
- Retain non-identical raw provider state as unclassified intake outside active
  authority, with locked list, inspect, and idempotent operator-attributed
  discard operations. Discard never applies or accepts imported state.
- Add the public API boundary: package `exports` define public subpaths, private
  source-path imports are rejected, and the surface is snapshotted in
  `api-surface/m1-public-api.json`.
- Add `migrateM0LocalWorkspace()` to migrate an M0 local-provider snapshot into
  a locked M1 durable generation, retaining exact source bytes, actor and source
  metadata, historical semantic records, frontier identity, and checkpoint IDs.
- Validate the full required suite on GitHub-hosted Ubuntu and Windows with Node
  22 and Python 3.12.

## 0.1.0 - 2026-07-31 (tagged: M0 local MVP baseline)

- Establish the UCF-Yjs local MVP baseline: typed command and outcome protocol,
  semantic log, deterministic projections, actor-neutral checkpoints, memory
  and local providers, citation reducer, headless JSONL transport, restart
  persistence, convergence tests, and vertical E2E coverage.
- Keep the baseline private and local. This release is not an npm publication
  and does not include editor/workbench, Velt, MCP, Git/W3C, hosted service, or
  package publication scope.
