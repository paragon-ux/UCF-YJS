# UCF-Yjs M1 Closeout Report

Status: PR closeout in progress after composite review

## Baselines

- UCF-Yjs M0 bundle baseline: `52c15db5073a2e3f5eee6283c2ed79430c1d14af`.
- UCF-Yjs M1 start head: `7fbb3cf6aee7d43e28499f5c2a865c9c65dd0cbb`.
- UCF-RS foundation baseline: `2b92f0cedeb987893479b39e9391d49b4f5c39c3`.
- UCF-RS current head at M1 start: `639f6d7ee368d4d057189dfca64042241b1b6516`.
- Active branch: `codex/ucf-yjs-m1-durable-runtime`.
- Tags were proposed only; no local or remote tags were created.

## Compatibility

Historical M0 semantic records are preserved. M0 read outcomes remain valid
historical records, while M1 valid `status.get` and `agent_view.get` requests
are observations that do not append semantic command, idempotency, or outcome
records.

## M1 Results

- Schema registry: `schemas/registry.json` and `packages/protocol/src/schema-registry.ts`
  register command, outcome, frontier, observation log, processor snapshot,
  checkpoint, provider snapshot, workspace generation, citation, and reducer
  schemas. Workspace generations are supported in M1.
- Observational reads: semantic frontier profile v2 separates valid reads from
  semantic identity and optional read audit.
- Conformance corpus: `ucf.behavior_fixtures.v1` covers activation, evidence
  edits, changed/missing/ambiguous evidence, explicit acceptance, stale
  observation, idempotency, checkpoint gating, offline replay, recovery
  required, and divergence. UCF-Yjs and UCF-RS adapters pass independently.
- Workspace generations: durable generation phases are `prepared`,
  `material_written`, `validated`, `published`, and `committed`; recovery is
  idempotent and does not append semantic records.
- Recovery evidence: phase-fault tests prove either the previous committed or
  intended complete generation is active; divergence fails closed.
- Locking: one OS-backed writer lock per workspace uses POSIX `flock` or
  Windows `msvcrt.locking` through a helper process. Immediate, bounded wait,
  release, and crash-release behavior are tested.
- Corruption fixtures: malformed manifest, digest mismatch, truncated log,
  command without outcome, bad idempotency reference, checkpoint document
  issues, stale reducer snapshot, undecodable anchor, unsupported schema, and
  provider document drift all fail closed with typed results.
- Persistent CLI: named-workspace init, validate, command submit, status,
  agent view, recovery inspect/resolve, checkpoint operations, and
  provider-neutral export/import operate on real persisted workspace state.
- Public API: package `exports` define public subpaths; private source-path
  imports are rejected; API surface is snapshotted in
  `api-surface/m1-public-api.json`.
- M0 durable migration: `migrateM0LocalWorkspace()` migrates an M0
  `ucf-yjs.local_workspace_snapshot.v1` local-provider file into a locked M1
  durable generation, retains exact source bytes, records actor/source
  metadata, anchors the M0 frontier, and preserves historical checkpoint IDs.

## Closeout Validation

The table below is a historical pre-review validation snapshot and is not the
final PR #2 merge-gate inventory. The final closeout run must be regenerated
on the final head after the composite checklist is complete.

| Command | Pass 2 result |
| --- | --- |
| `npm run build` | passed |
| `npm test` | 103/103 passed |
| `npm run test:conformance` | 21/21 passed |
| `npm run test:convergence` | 5/5 passed |
| `npm run test:e2e` | 3/3 passed |
| `npm run test:migrations` | 7/7 passed |
| `npm run test:corruption` | 15/15 passed |
| `npm run test:recovery` | 5/5 passed |
| `npm run test:locking` | 4/4 passed |
| `npm run test:public-api` | 5/5 passed |
| `npm run test:conformance-oracle` | 3/3 passed |
| `git diff --check` | passed with line-ending warnings only |

## Post-Review Local Validation

The local post-review pass on the current working head completed successfully.
CI status and PR review-thread resolution remain separate merge-gate evidence.

| Command | Result |
| --- | --- |
| `npm run build` | passed |
| `npm test` | 121/121 passed |
| `npm run test:conformance` | 21/21 passed |
| `npm run test:convergence` | 5/5 passed |
| `npm run test:e2e` | 6/6 passed |
| `npm run test:migrations` | 10/10 passed |
| `npm run test:corruption` | 16/16 passed |
| `npm run test:recovery` | 12/12 passed |
| `npm run test:locking` | 7/7 passed |
| `npm run test:public-api` | 5/5 passed |
| `npm run test:conformance-oracle` | 3/3 passed |
| `git diff --check` | passed with line-ending warnings only |

## Known Limitations

- The Python lock helper is required for OS-level locks in the Node runtime.
- No remote publication, package publication, tag creation, push, or PR was
  performed.
- M2 editor/workbench, Velt, MCP, Git/W3C, hosted integrations, and other
  adapter layers remain unimplemented by design.

## Verdict

No final M1 signoff claim is made by this report until the PR #2 composite
closeout checklist is fully satisfied on the final head. No M2 work has been
started in this change set.
