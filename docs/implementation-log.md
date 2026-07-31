# UCF-Yjs Implementation Log

## Baseline

- UCF-Yjs worktree: `C:\Users\USER\Desktop\Frameworks\UCF-RS\UCF-YJS`
- UCF-Yjs Git state: unborn `main`; `git rev-parse HEAD` has no commit.
- UCF-RS worktree: `C:\Users\USER\Desktop\Frameworks\UCF-RS\UCF-RS`
- UCF-RS original baseline commit: `c09e7716112c9b78ab36e3eb112bcc3d2f2393ff`
- UCF-RS hardened M0 baseline commit: `3e10e9b Fix UCF-RS M0 integrity blockers`
- UCF-RS working branch created for hardening: `codex/ucf-rs-foundation-hardening`
- UCF-RS original baseline tests: `python -m unittest discover -s tests -v` ran 36 tests and passed.
- UCF-RS hardened M0 baseline tests: `python -m unittest discover -s tests -v` ran 51 tests and passed twice after the bounded blocker corrective pass.
- UCF-RS supported Python versions: `pyproject.toml` requires `>=3.10`; Foundation A CI targets Python 3.10 and 3.12.
- UCF-RS CI platforms after Foundation A: Ubuntu latest and Windows latest.
- UCF-RS mutating commands decorated with `@authority_mutation`: `init`, `activate`, `apply-edit`, `queue-offline-edit`, `replay-offline`, `accept`, `deactivate`, `reactivate`, `reconcile`, `import-registry`.
- Current UCF-RS authority files: `.ucf-rs/project.json`, `.ucf-rs/operation-log.jsonl`, `.ucf-rs/citation-index.jsonl`, `.ucf-rs/document-index.jsonl`, `.ucf-rs/handle-cache.jsonl`.
- Current UCF-RS operational replay files: `.ucf-rs/offline-queue.jsonl`, `.ucf-rs/offline-replayed.jsonl`.
- Current UCF-RS generated projections: `docs/ucf-trace-ledger.jsonl`, `docs/ucf-trace-status.json`, `docs/ucf-trace-report.md`.
- Source-plus-authority write order before Foundation B: `apply-edit` writes source text, then operation/index/document records; `queue-offline-edit` writes source text, then the offline queue record; `replay-offline` writes source text and operation/index/document records for each queued edit, then archives and clears the queue.

## Precedence Decision

- Decision: execute through the full local MVP despite the revised plan and TRD describing M1 as approval-gated.
- Alternatives considered: stop after M0, or ask for confirmation before M1.
- Reason selected: `ONE_SHOT_KICKOFF_PROMPT.md` is the highest-precedence source and explicitly authorizes a continuous one-shot run through the local MVP.
- Compatibility consequence: M0 decisions must still be documented before implementation, but the run may continue into MVP scaffolding without an additional approval pause.
- Future extension point: if a later authoritative doc reverses this, stop at the next feature boundary and record the new gate.

## UCF-RS M0 Blocker Corrective Pass

- Objective: close the two hold-M0 blockers before resuming UCF-Yjs M0.
- Files changed in UCF-RS: `scripts/ucf_rs.py`, `tests/test_ucf_rs.py`.
- Fixes: index/operation coverage now fails closed for edit index records that reference non-edit operations or non-string partition fields; reconcile now commits relocation operation, citation-index record, and document-index record in one authority transaction.
- Tests added: four audit coverage tamper regressions and one reconcile committed-phase fault regression.
- Verification: PowerShell-expanded py_compile passed; full unittest discovery passed twice at 51 tests; CLI help passed; strict status passed; CI fixture passed; `git diff --check` passed with line-ending warnings only.
- Review-agent result: no unresolved findings after the corrective pass.
- Gate status: UCF-RS M0 blocker corrective pass complete.

## UCF-Yjs M0 - C1 Authority And Protocol Decisions

- Objective: create the first M0 decision set for authority planes, protocol envelopes, domain contract, provider boundary, and an M0 TRD summary.
- Files changed: `docs/TRD.md`, `docs/authority-planes.md`, `docs/protocol.md`, `docs/domain-contract.md`, `docs/provider-contract.md`.
- Architectural decisions: one logical semantic command processor per workspace; public APIs use typed command/outcome envelopes; raw Yjs updates remain internal provider material; provider state is not authority; projections are rebuildable; UCF-RS remains an independent conformance oracle only.
- Tests: doc-only validation with `git diff --check` and invariant grep passed.
- Review-agent result: no findings.
- Gate status: C1 complete.

## UCF-Yjs M0 - C2 Canonicalization, Live Version, And Checkpoints

- Objective: define exact canonical JSON rules, digest domains, live-version inputs, projection digest boundaries, actor-neutral checkpoint identity, and forward-only restore semantics.
- Files changed: `docs/canonicalization.md`, `docs/checkpoint.md`.
- Architectural decisions: digest inputs use domain-framed canonical UTF-8 JSON; live version includes collaborative projection digest plus semantic frontier; checkpoint identity includes workspace/domain/frontier/document/anchor/accepted-projection/policy fields and excludes actors, timestamps, provider snapshots, awareness, and capability-filtered views.
- Tests: doc-only validation with `git diff --check` and invariant grep passed.
- Review-agent result: no findings.
- Gate status: C2 complete.

## UCF-Yjs M0 - C3 Offline, Schema, Transport, And Security Decisions

- Objective: define schema evolution, mixed-client behavior, local MVP security/data policy, stdio transport choice, offline draft-versus-semantic-command semantics, stale observation handling, raw editor mutation policy, and recovery semantics.
- Files changed: `docs/schema-evolution.md`, `docs/security.md`, `docs/offline-semantics.md`.
- Architectural decisions: stdio JSONL is the MVP non-JavaScript transport; incompatible clients become read-only for unsupported writes; MVP routes editor edits through `document.replace_range`; semantic commands require processor outcomes; no encryption-at-rest or hostile-client claim is made.
- Tests: doc-only validation with `git diff --check` and invariant grep passed.
- Review-agent result: no findings.
- Gate status: C3 complete.

## UCF-Yjs M0 - C4 Yjs Spikes

- Objective: record bounded disposable Yjs spike evidence and M0 acceptance status.
- Files changed: `docs/yjs-spike-report.md`, `docs/m0-acceptance.md`, `docs/reviews/m0-c4.md`.
- Spike command: `node spikes/yjs-m0-spike.cjs`.
- Spike result: pass with Yjs `13.6.31`; reordered updates converge, duplicate updates are harmless, offline updates converge after exchange, RelativePositions agree after sync, boundary association is observable, deleted anchors are detectable, and provider-neutral export/import is feasible.
- Architectural decisions: spike code remains non-authoritative; provider-neutral Yjs bytes are provider material, not command payloads or checkpoint identity; deleted anchors classify as missing/unresolved.
- Review-agent result: no findings.
- Gate status: C4 complete. M0 is complete.

## UCF-Yjs MVP - D1 Minimal Project Scaffold

- Objective: create the minimal TypeScript workspace and required package/test directories without adding GUI, Velt, MCP, SDK, Git, W3C, or generic plugin scaffolding.
- Files changed: `.gitignore`, `package.json`, `package-lock.json`, `tsconfig.json`, `packages/*/src/index.ts`, `tests/scaffold.test.ts`, `tests/conformance/scaffold-conformance.test.ts`, `tests/convergence/scaffold-convergence.test.ts`, `tests/e2e/scaffold-e2e.test.ts`.
- Architectural decisions: Node 22 and TypeScript strict mode; Node's built-in test runner; Yjs dependency only as the collaboration substrate; all required packages expose a concrete responsibility marker so no package directory is empty.
- Tests: `npm run build`, `npm test`, `npm run test:conformance`, `npm run test:convergence`, `npm run test:e2e`, and `git diff --check` passed.
- Review-agent result: no findings.
- Gate status: D1 complete.

## UCF-Yjs MVP - D2 Protocol Canonical Serialization

- Objective: implement schema-versioned command/outcome protocol primitives, canonical JSON, domain-framed hashes, command payload digests, record hashes, and protocol validators.
- Files changed: `packages/protocol/src/index.ts`, `tests/conformance/protocol.test.ts`, `docs/reviews/d2-protocol.md`.
- Architectural decisions: protocol hashes use the M0 canonicalization profile; command payload digests exclude transport/retry metadata; outcome record hashes exclude `outcome_hash`; provider-specific fields and raw Yjs update material are rejected from command envelopes.
- Review fixes applied: outcome code validation, required nullable frontier fields, whole-envelope JSON validation, nested provider-field rejection, normalized object-key canonicalization, and missing outcome schema-version handling.
- Tests: `npm run build`, `npm run test:conformance`, `npm test`, and `git diff --check` passed.
- Review-agent result: no findings after corrective passes.
- Gate status: D2 complete.

## UCF-Yjs MVP - D3 Durable Semantic Log

- Objective: implement append-only semantic log records for immutable commands, idempotency decisions, immutable outcomes, workspace sequence, previous outcome hash, and outcome hash.
- Files changed: `packages/semantic-log/src/index.ts`, `tests/semantic-log.test.ts`, `docs/reviews/d3-semantic-log.md`.
- Architectural decisions: semantic log records are command, idempotency, and outcome records; duplicate command IDs and same-payload idempotency retries return the original outcome without appending another outcome; different-payload idempotency reuse appends a typed conflict outcome; the outcome hash chain is the semantic frontier.
- Recovery validation: detects corrupt commands/outcomes, duplicate commands/outcomes, sequence gaps, previous-hash mismatches, record-hash mismatches, commands without outcomes, outcomes without commands, and invalid idempotency references.
- Review fixes applied: defensive cloning for immutability, stable retry behavior for repeated different-payload idempotency conflicts, and stricter idempotency-reference validation.
- Tests: `npm run build`, `npm test`, `npm run test:conformance`, and `git diff --check` passed.
- Review-agent result: no findings after corrective passes.
- Gate status: D3 complete.

## UCF-Yjs MVP - D4 Projection Engine

- Objective: implement deterministic rebuildable projections from provider-neutral collaborative state, validated semantic log, reducer version, and capability context.
- Files changed: `packages/projections/src/index.ts`, `tests/projections.test.ts`, `docs/reviews/d4-projections.md`.
- Projections implemented: workspace status, documents, citations, conflicts, allowed actions, bounded agent view, live projection digest, live version, anchor projection digest, accepted projection digest, and agent-view response digest.
- Architectural decisions: projection rebuild rejects invalid semantic logs; identity digests use unfiltered deterministic inputs; returned document and agent views are capability-filtered; projections remain derived data and are not edited as authority.
- Review fix applied: redacted capability contexts now receive redacted top-level document projections while accepted projection identity remains unchanged.
- Tests: `npm run build`, `npm test`, `npm run test:conformance`, and `git diff --check` passed.
- Review-agent result: no findings after corrective pass.
- Gate status: D4 complete.

## UCF-Yjs MVP - D5 Checkpoint Store

- Objective: implement content-addressed accepted checkpoint manifests and forward-only checkpoint operations.
- Files changed: `packages/checkpoint-store/src/index.ts`, `tests/checkpoint-store.test.ts`, `docs/reviews/d5-checkpoints.md`.
- Checkpoint identity inputs: workspace ID, parent checkpoint ID, semantic frontier, document digests, anchor projection digest, accepted projection digest, collaborative schema version, domain schema version, reducer version, and policy.
- Excluded from identity: actor/capability fields and optional provider snapshot references.
- Operations implemented: save, reload validation, open-readonly, fork plan, reapply plan, document digest, and manifest validation.
- Review fix applied: reloaded manifests now validate that the checkpoint ID matches the manifest identity.
- Tests: `npm run build`, `npm test`, `npm run test:conformance`, and `git diff --check` passed.
- Review-agent result: no findings after corrective pass.
- Gate status: D5 complete.

## UCF-Yjs MVP - D6-D7 Providers

- Objective: implement deterministic in-memory provider and local persisted provider behind the same provider-neutral Yjs state boundary.
- Files changed: `packages/provider-memory/src/index.ts`, `packages/provider-local/src/index.ts`, `tests/convergence/provider-memory.test.ts`, `tests/conformance/provider-local.test.ts`, `docs/reviews/d6-d7-providers.md`.
- Memory provider behavior: connect, disconnect, reconnect, duplicate/reordered update delivery, sync, provider-neutral export/import, and no domain logic.
- Local provider behavior: open, safe save via temporary file and rename, reload, compact, export/import, and restart recovery through persisted state bytes.
- Review fix applied: disconnected client edits no longer enter provider state until reconnect explicitly merges local state.
- Tests: `npm run build`, `npm run test:convergence`, `npm run test:conformance`, `npm test`, and `git diff --check` passed.
- Review-agent result: no findings after corrective pass.
- Gate status: D6-D7 complete.

## UCF-Yjs MVP - D8-D12 Processor, Citation Reducer, CLI, And E2E

- Objective: complete the local MVP vertical slice with command processing, citation reducer, semantic interaction, JSONL CLI transport, and end-to-end workflow coverage.
- Files changed: `packages/domain-citations/src/index.ts`, `packages/command-processor/src/index.ts`, `packages/cli/src/index.ts`, `tests/command-processor.test.ts`, `tests/e2e/mvp-vertical-slice.test.ts`, `docs/reviews/d8-d12-vertical-slice.md`.
- Processor behavior: validates protocol envelopes, checks capability, resolves idempotency, validates stale observations, executes reducer transactions, appends semantic outcomes, advances semantic frontier, rebuilds projections, and returns typed outcomes.
- Reducer operations implemented: `workspace.create`, `document.create`, `document.replace_range`, `citation.activate`, `citation.resolve`, `citation.accept_current`, `citation.deactivate`, `checkpoint.create`, `agent_view.get`, and `status.get`.
- Citation semantics: stable citation IDs, accepted evidence hashes, internal Yjs RelativePosition anchors, explicit boundary policy, exact evidence validation, statuses `valid`, `changed_unaccepted`, `missing`, `ambiguous`, and `inactive`, no heuristic tie-break, no automatic lineage, and no implicit acceptance.
- CLI behavior: headless JSONL command-envelope transport with deterministic JSON output, stable error exit, maximum input size, and no raw CRDT requirement for normal workflows.
- E2E coverage: two replicas, memory provider, local provider restart/reload, direct processor, CLI/headless client, checkpoint reproduction, identical semantic frontier, actor-neutral checkpoint identity, equal and redacted agent views, no source text in default diagnostics, and no raw Yjs bytes in agent workflow outputs.
- Review fixes applied: internal RelativePosition anchors and deletion-to-missing regression.
- Tests: `npm run build`, `npm test`, `npm run test:convergence`, `npm run test:e2e`, `npm run test:conformance`, and `git diff --check` passed.
- Review-agent result: no findings after corrective pass.
- Gate status: D8-D12 complete.

## UCF-Yjs MVP Final Validation

- Final pass 1:
  - `npm run build`: pass.
  - `npm test`: pass, 48 tests.
  - `npm run test:conformance`: pass, 18 tests.
  - `npm run test:convergence`: pass, 5 tests.
  - `npm run test:e2e`: pass, 2 tests.
  - `git diff --check`: pass.
  - `git status --short`: expected untracked initial-project files in unborn `main`.
- Final pass 2:
  - `npm run build`: pass.
  - `npm test`: pass, 48 tests.
  - `npm run test:conformance`: pass, 18 tests.
  - `npm run test:convergence`: pass, 5 tests.
  - `npm run test:e2e`: pass, 2 tests.
  - `git diff --check`: pass.
  - `git status --short`: expected untracked initial-project files in unborn `main`.
- MVP status: complete under the one-shot kickoff scope.

## Foundation A - UCF-RS Guardrails, Contracts, And CI

### A1 Storage And Behavioral Contracts

- Objective: document storage schemas, authority/projection classification, canonical hash boundaries, schema behavior, offline queue/archive classification, and UCF-Yjs behavior matrix.
- Files changed: `docs/storage-schemas.md`, `README.md`, `docs/architecture.md`.
- Architectural decisions: no canonical hash domains or source behavior changed; UCF-Yjs may reproduce behavior but not UCF-RS storage, JSONL layouts, transaction formats, code, or hashes.
- Tests: existing suite run as regression coverage.
- Review-agent result: initial combined review found no A1 correctness issue after checking docs against implementation.
- Gate status: complete.

### A2 Data Policy

- Objective: document retention, visibility, export, evidence text disclosure, diagnostic redaction, backups, deletion, no encryption-at-rest guarantee, and trusted local threat model.
- Files changed: `docs/data-policy.md`, `README.md`, `docs/architecture.md`.
- Architectural decisions: default diagnostics remain source-text redacted; explicit content-bearing surfaces are documented as source files, offline replay files, and explicit block/content exports.
- Tests: existing status/resolve/HTTP tests confirm default responses remain metadata and hash oriented.
- Review-agent result: initial combined review found no A2 correctness issue after checking current diagnostic surfaces.
- Gate status: complete.

### A3 Local HTTP Guardrails

- Objective: add request-body size enforcement, invalid/negative `Content-Length` rejection, 413 for oversized bodies, loopback-only default, unsafe remote opt-in, and docs for no auth/TLS.
- Files changed: `scripts/ucf_rs.py`, `tests/test_ucf_rs.py`, `docs/commands.md`, `README.md`, `docs/data-policy.md`.
- Architectural decisions: default max HTTP request body is 1 MiB; non-loopback binding requires `--unsafe-remote` and warns on stderr; no remote authentication was added.
- Tests: four focused HTTP tests pass.
- Review-agent result: initial review found a documentation validation issue unrelated to HTTP behavior; fixed before acceptance.
- Gate status: complete.

### A4 CI Matrix

- Objective: expand CI to Ubuntu and Windows, Python 3.10 and 3.12, compilation, full unit discovery, CLI help, and strict status against a valid initialized fixture.
- Files changed: `.github/workflows/ucf-rs.yml`, `scripts/ci_status_fixture.py`, `README.md`.
- Architectural decisions: strict status fixture is generated in a temporary directory because UCF-RS project identity includes the absolute root path.
- Tests: `scripts/ci_status_fixture.py` passes locally and validates an initialized fixture.
- Review-agent finding fixed: README and CI originally used or implied invalid `tests/*.py`/non-initialized fixture behavior for Windows/local validation. The final version uses a cross-shell Python compile command and a temporary initialized fixture helper.
- Gate status: complete.

### Foundation A Verification

- `python -c "import pathlib, py_compile; [py_compile.compile(str(path), doraise=True) for path in [*pathlib.Path('scripts').glob('*.py'), *pathlib.Path('tests').glob('*.py')]]"`: pass.
- `python -m unittest discover -s tests -k http -v`: 4 tests, pass.
- `python -m unittest discover -s tests -v`: 38 tests, pass.
- `python -m unittest discover -s tests -v`: 38 tests, pass.
- `python scripts/ucf_rs.py --help`: pass.
- `python scripts/ci_status_fixture.py`: pass.
- `git diff --check`: pass; Git reported line-ending conversion warnings only.

### Foundation A Review Disposition

- Critical findings: none.
- High findings: none.
- Medium findings: README validation command and CI strict-status fixture weakness; fixed.
- Low findings: none accepted.
- Remaining limitations: HTTP is local/trusted only, with no auth or TLS by design.
- Resulting gate status: Foundation A complete and ready for Foundation B.

## Foundation B - UCF-RS Recoverable Consistency

### B1 Transaction Primitives

- Objective: implement recoverable write-ahead file transactions outside canonical operation and citation-index hashes.
- Files changed: `scripts/ucf_rs.py`, `docs/storage-schemas.md`, `docs/architecture.md`.
- Architectural decisions: transaction manifests live under `.ucf-rs/transactions/`; phases are `prepared`, `source_applied`, `authority_applied`, and `committed`; file hashes use `ucf.transaction_file.v1`, separate from canonical operation/index hashes.
- Recovery model: prepared replacements are written in target directories, flushed, applied with `os.replace`, and parent directory sync is attempted where supported. Recovery recognizes already-applied targets by intended file hash.
- Gate status: complete.

### B2 Source-Plus-Authority Integration

- Objective: apply transactions to `apply-edit`, `queue-offline-edit`, and `replay-offline`, and review other multi-file mutation paths.
- Files changed: `scripts/ucf_rs.py`, `tests/test_ucf_rs.py`.
- Architectural decisions: commands build operation/index/document/offline records before mutation, then replace source and authority files through transaction manifests. Later review extended transaction use to activation, acceptance, reactivation, deactivate/reconcile state records, and reconcile document-index writes.
- Duplicate prevention: recovery replaces whole prepared file contents and checks intended hashes, so repeated recovery does not append operation, index, offline queue, or replay archive records twice.
- Gate status: complete.

### B3 Recovery Surface

- Objective: expose idempotent recovery and strict read-only detection.
- Files changed: `scripts/ucf_rs.py`, `docs/commands.md`.
- CLI: `recover --format json` returns `ucf-rs.recovery.v1` with recovered transaction records.
- Mutation behavior: mutating commands recover pending transactions under the authority lock before reading mutable authority.
- Read-only behavior: `status --strict` reports `E_TRANSACTION_PENDING` or `E_TRANSACTION_MALFORMED` and refuses to validate pending or malformed transaction state.
- Gate status: complete.

### B4 Failure And Restart Tests

- Objective: add deterministic phase injection, idempotent recovery tests, duplicate-record checks, partial queue consumption checks, subprocess crash/restart recovery, and lock regression coverage.
- Files changed: `tests/test_ucf_rs.py`.
- Tests added: apply-edit recovery across `before_preparation`, `prepared`, `source_applied`, `authority_applied`; queue recovery appends one offline record; replay recovery consumes queue/archive once; subprocess crash after `source_applied` recovers after restart.
- Existing coverage retained: cross-process authority lock regression remains passing.
- Gate status: complete.

### Foundation B Verification

- `python -c "import pathlib, py_compile; [py_compile.compile(str(path), doraise=True) for path in [*pathlib.Path('scripts').glob('*.py'), *pathlib.Path('tests').glob('*.py')]]"`: pass.
- `python -m unittest discover -s tests -k transaction -v`: 3 tests, pass.
- `python -m unittest discover -s tests -k subprocess -v`: 1 test, pass.
- `python -m unittest discover -s tests -k lifecycle -v`: 3 tests, pass.
- `python -m unittest discover -s tests -k accept -v`: 5 tests, pass.
- `python -m unittest discover -s tests -k reconcile -v`: 2 tests, pass.
- `python -m unittest discover -s tests -v`: 42 tests, pass.
- `python -m unittest discover -s tests -v`: 42 tests, pass.
- `python scripts/ucf_rs.py --help`: pass.
- `python scripts/ci_status_fixture.py`: pass.
- `git diff --check`: pass; Git reported line-ending conversion warnings only.

### Foundation B Review Disposition

- Critical findings: none.
- High findings: none.
- Medium findings fixed: initial review found remaining direct multi-file authority append paths for lifecycle mutations; fixed by adding shared authority-record transactions for activation, acceptance, reactivation, state transitions, and reconcile document-index writes.
- Low findings: none accepted.
- Remaining limitations: UCF-RS claims recoverable consistency, not impossible cross-file atomicity. Committed transaction manifests may remain as operational recovery history outside canonical authority hashes.
- Resulting gate status: Foundation B complete. UCF-RS baseline is hardened enough for UCF-Yjs M0 conformance translation without importing UCF-RS implementation internals.

## UCF-YJS PR Follow-Up - Shared Authority MVP

### Feature F1 Provider-Backed Processor Authority

- Objective: replace the disconnected vertical-slice demonstration with one provider-backed Yjs document plus reloadable semantic authority state.
- Files changed: `packages/command-processor/src/index.ts`, `packages/checkpoint-store/src/index.ts`, `packages/provider-local/src/index.ts`, `tests/e2e/mvp-vertical-slice.test.ts`.
- Architectural decisions: `WorkspaceProcessor` can attach to a provider-owned `Y.Doc`; semantic log, citations, relative-position anchors, titles, checkpoint manifests, and checkpoint document material serialize as processor authority; `LocalProvider` persists provider-neutral Yjs bytes plus opaque authority JSON without making provider state domain authority.
- Tests: `tests/e2e/mvp-vertical-slice.test.ts` now creates a shared provider document, syncs disconnected replica edits back into the processor document, persists provider and authority state together, restores the processor from the local snapshot, reproduces checkpoint/projection state, and runs CLI status through the restored authority.
- Verification: `npm run test:e2e` passed, 2 tests. `npm test` passed, 48 tests.
- Review-agent findings: none for this feature diff.
- Remaining limitations: later queued fixes still need to address live-version publication, malformed requests, JSONL partial-result handling, reducer validation, authorization granularity, and checkpoint manifest contract details.
- Gate status: complete.

### Feature F2 Live Version And Malformed Request Correctness

- Objective: make `new_live_version` immediately usable by clients and prevent unrelated malformed requests from sharing one synthetic idempotency entry.
- Files changed: `packages/protocol/src/index.ts`, `packages/semantic-log/src/index.ts`, `packages/command-processor/src/index.ts`, `tests/command-processor.test.ts`.
- Architectural decisions: outcome record hashes exclude `new_live_version`, breaking the previous hash cycle while preserving the outcome-chain hash over the deterministic command result fields. The processor now appends the outcome, computes the true post-frontier live version, and fills that field before returning. Malformed commands receive synthetic idempotency keys and payload digests derived from the malformed request shape instead of the constant `"invalid"`.
- Tests: added regressions for round-tripping a returned `new_live_version` on the next command and for distinct malformed requests returning distinct rejected outcomes.
- Verification: focused command-processor test passed, 6 tests. `npm test` passed, 50 tests.
- Review-agent findings: none for this feature diff.
- Gate status: complete.

### Feature F3 Transport, Reducer, Checkpoint, And Commit-Order Corrections

- Objective: close the remaining PR blockers around JSONL batch visibility, reducer validation, checkpoint attribution, local durability, authorization, and mutation-before-log-commit ordering.
- Files changed: `packages/cli/src/index.ts`, `packages/command-processor/src/index.ts`, `packages/domain-citations/src/index.ts`, `packages/checkpoint-store/src/index.ts`, `packages/projections/src/index.ts`, `packages/provider-local/src/index.ts`, tests under `tests/`.
- Architectural decisions: JSONL parse failures are converted into per-line typed rejected outcomes while preserving prior and later results; command execution stages reducer/checkpoint/Yjs mutations on a cloned state and publishes them only after semantic-log append succeeds; checkpoint manifests now carry `created_by`, `created_at`, `domain`, `live_version`, full policy dimensions, and actor-neutral canonical full-view verification metadata while keeping checkpoint identity actor-neutral.
- Tests: added regressions for malformed JSONL partial output and parse-error ID uniqueness, invalid activation ranges, accept-capability enforcement, unresolved-anchor `missing` preservation, semantic-log append failure rollback, checkpoint attribution and identity exclusions, and capability-independent canonical full-view digests.
- Verification: focused CLI test passed, 2 tests. Focused command-processor/E2E test passed, 9 tests. `npm test` passed, 55 tests.
- Review-agent findings fixed: the first review pass found checkpoint verification was using a capability-filtered agent-view response digest. The fix introduced `canonical_full_view_digest` and uses it for checkpoint verification; focused projection/checkpoint/processor tests and the full suite passed afterward.
- Final review-agent findings: none.
- Gate status: complete.

### Feature F4 Authority Integrity Re-Review Follow-Up

- Objective: address PR re-review `4825331824` blockers around raw Yjs checkpoint freshness, unresolved-anchor acceptance, retained checkpoint document validation, immutable final outcome append, and staged workspace ID publication.
- Files changed: `packages/command-processor/src/index.ts`, `packages/checkpoint-store/src/index.ts`, `packages/semantic-log/src/index.ts`, `docs/canonicalization.md`, `docs/checkpoint.md`, and focused tests.
- Architectural decisions: `checkpoint.create` now resolves/classifies all active citations against the current converged document before creating an accepted manifest and returns a typed conflict when evidence is changed or unresolved; `citation.accept_current` rejects unresolved/missing/inactive/ambiguous citations before changing accepted evidence; retained checkpoint documents are validated against manifest digests on construction and fork; `new_live_version` is documented as non-hash-authoritative and final outcomes are appended once with the computed post-frontier live version.
- Tests: added regressions for raw replica-originated Yjs edits blocking checkpoints until explicit acceptance, missing citation acceptance preserving accepted evidence, tampered/missing/extra/unknown/duplicate checkpoint document material, outcome hash authority, committed/rejected/conflict live-version round trips, and staged workspace ID publication.
- Verification: focused changed-area tests passed, 36 tests. `npm test` passed, 60 tests.
- Review-agent findings fixed: initial pass found idempotency-payload conflict outcomes could still return stale `new_live_version` because the semantic-log conflict branch overwrote the finalized draft. Fixed by preserving `draft.new_live_version` and adding conflict/rejected round-trip coverage.
- Final review-agent findings: none.
- Gate status: complete.
