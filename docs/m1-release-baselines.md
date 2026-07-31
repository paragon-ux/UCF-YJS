# M1 Release Baselines

This file records the immutable release inputs for M1.1. It is a documentation
and release-preparation artifact only; it does not change runtime behavior.

## Recorded At

- Date: 2026-07-31
- UCF-Yjs worktree: `C:\Users\USER\Desktop\Frameworks\UCF-RS\UCF-YJS`
- Active branch for M1 work: `codex/ucf-yjs-m1-durable-runtime`
- Starting branch: `main`
- Starting UCF-Yjs HEAD: `7fbb3cf6aee7d43e28499f5c2a865c9c65dd0cbb`
- Starting UCF-Yjs commit summary: `7fbb3cf Clarify UCF-YJS JSONL projection output`
- Starting UCF-Yjs working tree: clean before M1.1 edits

## Immutable Baseline Commits

| Project | Baseline role | Commit | Commit summary | Tag status |
| --- | --- | --- | --- | --- |
| UCF-RS | Merged foundation oracle baseline named by M1 bundle | `2b92f0cedeb987893479b39e9391d49b4f5c39c3` | `2b92f0c Merge pull request #3 from paragon-ux/codex/ucf-rs-foundation-hardening` | No local tag present |
| UCF-Yjs | Merged M0 local MVP baseline named by M1 bundle | `52c15db5073a2e3f5eee6283c2ed79430c1d14af` | `52c15db Merge pull request #1 from paragon-ux/codex/ucf-yjs-mvp` | No local tag present |

The checked-out repository heads are newer than the named baseline commits:

| Project | Current local head | Commit summary |
| --- | --- | --- |
| UCF-RS | `639f6d7ee368d4d057189dfca64042241b1b6516` | `639f6d7 Fix UCF-RS documentation discrepancies` |
| UCF-Yjs | `7fbb3cf6aee7d43e28499f5c2a865c9c65dd0cbb` | `7fbb3cf Clarify UCF-YJS JSONL projection output` |

M1 compatibility and migration tests must be able to name the immutable
baseline commits above, while implementation work starts from the current local
UCF-Yjs head.

## Proposed Local Release Labels

Tags are not created by M1.1 because the one-shot prompt does not authorize
remote publication or repository writes beyond local implementation.

| Project | Proposed tag | Proposed target |
| --- | --- | --- |
| UCF-RS | `v0.1.0-foundation` | `2b92f0cedeb987893479b39e9391d49b4f5c39c3` |
| UCF-Yjs | `v0.1.0-m0` | `52c15db5073a2e3f5eee6283c2ed79430c1d14af` |

## Runtime And Platform Baseline

- Local Node.js: `v22.19.0`
- Local npm: `11.12.1`
- UCF-Yjs package engine: Node.js `>=22`
- UCF-Yjs CI at M1 start: Ubuntu latest, Node.js 22
- Local UCF-RS Python observed for oracle inspection: `3.11.9`
- UCF-RS documented CI baseline: Ubuntu latest and Windows latest, Python 3.10
  and 3.12

M1 locking and durability work must add direct Windows and POSIX validation
before the M1 closeout gate.

## Baseline Validation

Commands were run before M1.1 edits from
`C:\Users\USER\Desktop\Frameworks\UCF-RS\UCF-YJS`.

| Command | Result |
| --- | --- |
| `git status --short` | Pass; clean before M1.1 edits |
| `git branch --show-current` | `main` before branch creation |
| `git rev-parse HEAD` | `7fbb3cf6aee7d43e28499f5c2a865c9c65dd0cbb` |
| `npm ci` | Pass; 6 packages installed/audited, 0 vulnerabilities |
| `npm run build` | Pass |
| `npm test` | Pass; 60 tests, 60 pass |
| `npm run test:conformance` | Pass; 18 tests, 18 pass |
| `npm run test:convergence` | Pass; 5 tests, 5 pass |
| `npm run test:e2e` | Pass; 2 tests, 2 pass |

## Current Schema And Profile Versions

These are the versions visible in the current implementation and public docs at
the M1.1 baseline. M1.2 owns the registry vocabulary and compatibility rules.

| Authority area | Current version or profile |
| --- | --- |
| Command schema | `ucf-yjs.command.v1` |
| Outcome schema | `ucf-yjs.outcome.v1` |
| Checkpoint manifest schema | `ucf-yjs.checkpoint.v1` |
| Processor snapshot schema | `ucf-yjs.processor_snapshot.v1` |
| Local workspace snapshot schema | `ucf-yjs.local_workspace_snapshot.v1` |
| Collaborative schema used by checkpoint manifests | `ucf-yjs.collab.v1` |
| Citation domain schema | `ucf-yjs.citations.v1` |
| Implementation default reducer version | `ucf-yjs.reducer.v1` |
| Documentation target citation reducer version | `ucf-yjs.citations.reducer.v1` |
| Agent view schema | `ucf-yjs.agent_view.v1` |
| Provider export schema | `ucf-yjs.provider_export.v1` |
| Canonicalization profile | M0 canonical JSON profile documented in `docs/canonicalization.md` |
| Semantic frontier profile | M0 outcome-chain frontier: workspace sequence plus outcome hash |

The reducer-version naming difference is a compatibility-policy item for M1.2.
M1.1 records it without changing runtime behavior.

## M0 Known Limitations And Deferred Work

- No schema/version registry yet.
- `status.get` and `agent_view.get` still exist in M0 as reducer operations;
  M1.3 must move future pure reads outside semantic frontier identity without
  rewriting historical M0 logs.
- Local persistence stores provider state and opaque processor authority, but
  does not yet provide recoverable multi-plane workspace generations.
- No explicit Windows/POSIX writer-lock implementation exists for M1 writer
  exclusion.
- Reload validation exists for semantic logs and checkpoint material, but the
  M1 corruption fixture matrix is not complete.
- The CLI is a headless JSONL transport, not yet a persistent named-workspace
  runtime.
- Public package export maps and private-path import tests are not yet present.
- No editor/workbench, Velt, MCP, Git/W3C, hosted service, hostile-client
  security, package publication, or remote repository publication is included.
