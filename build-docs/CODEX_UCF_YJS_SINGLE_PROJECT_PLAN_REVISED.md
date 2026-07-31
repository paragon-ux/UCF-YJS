# Codex Execution Plan: UCF-Yjs Single Long-Term Project

**Status:** Ready for Foundation A, Foundation B, and M0 execution; M1 remains approval-gated  
**Project:** UCF-Yjs  
**Decision:** Build one long-term project, not three parallel architectures  
**Primary objective:** Harden UCF-RS as the local authority foundation, then implement a protocol-first, local-provider-first UCF-Yjs MVP  
**Reference TRD:** `UCF-Yjs-TRD-Single-Long-Term-Project.md`

## 1. Operating principle

UCF-Yjs is the long-term implementation target. UCF-RS hardening is a required
foundation phase in this plan. Cite2Site v2 is not a parallel build stream.

Use the prior architectures intentionally:

- UCF-RS is hardened first as an independent behavioral baseline and
  conformance oracle for source-clean citation semantics. UCF-Yjs may preserve
  those behaviors, but it does not inherit the UCF-RS runtime, storage layout,
  transaction format, JSONL schemas, Python implementation, or canonical hashes.
- Cite2Site v2 contributes identity separation lessons: citation identity,
  evidence identity, source representation identity, and lineage must not be
  collapsed.

Do not copy either architecture wholesale into UCF-Yjs.

## 2. Non-negotiable boundaries

- Do not start with GUI.
- Do not start with Velt.
- Do not build Cite2Site v2 as part of this plan.
- Do not add Yjs, Velt, Git, W3C, editor bindings, or generic provider
  integrations to UCF-RS hardening.
- Do not perform broad UCF-RS decomposition as part of hardening.
- Do not change existing UCF-RS canonical hash semantics.
- Treat UCF-RS as a behavioral baseline and conformance oracle, not as a
  UCF-Yjs runtime, package, storage, schema, or code dependency.
- Do not expose raw Yjs updates as the normal public agent contract.
- Do not treat CRDT convergence as semantic acceptance.
- Do not treat provider snapshots as accepted checkpoints.
- Do not infer citation or evidence lineage from path, locator, identical text,
  or anchor survival.
- Do not add Git or W3C dependencies in MVP.
- Do not support hostile clients in MVP.
- Do not create, push, publish packages, or open PRs without explicit
  authorization.

## 3. Repository setup

Use the existing UCF-RS repository for foundation hardening. Create a new local
UCF-Yjs project directory only after UCF-RS hardening exits its validation gate
and the destination is confirmed.

UCF-RS branch:

```text
codex/ucf-rs-foundation-hardening
```

Recommended local directory:

```text
ucf-yjs/
```

Recommended initial branch if the project is already a Git repository:

```text
codex/protocol-first-mvp
```

Before editing any existing repository:

```bash
git status --short
git branch --show-current
git rev-parse HEAD
```

Stop if unrelated user modifications overlap planned files.

## 4. Foundation Phase: UCF-RS hardening

Goal: make the existing local source-clean authority runtime independently
recoverable and suitable as a behavioral conformance oracle for UCF-Yjs.

UCF-RS hardening is delivered in two separately reviewable changes. Foundation
B must not be combined with Foundation A in one commit or review unit.

### 4A. Foundation A: guardrails, contracts, and CI

Baseline commands:

```bash
python -m py_compile scripts/ucf_rs.py tests/*.py
python -m unittest discover -s tests -v
python scripts/ucf_rs.py --help
python scripts/ucf_rs.py status --strict
git diff --check
```

Scope:

- [ ] Inspect every command decorated with `@authority_mutation`.
- [ ] Identify commands that mutate both source projection and authority files.
- [ ] Add `docs/storage-schemas.md`.
- [ ] Document canonical hashing boundaries and authoritative versus derived
      files without changing existing hash semantics.
- [ ] Add data-handling policy for `.ucf-rs/`, offline queues, replay archives,
      generated projections, backups, diagnostic redaction, and the absence of
      an encryption-at-rest claim.
- [ ] Harden local HTTP with a request-size limit, invalid or negative
      `Content-Length` rejection, loopback-only default, and explicit unsafe
      remote opt-in.
- [ ] Expand CI to Ubuntu and Windows across Python 3.10 and 3.12.
- [ ] Confirm the real test count from the checked-out commit.

Foundation A validation:

```bash
python -m py_compile scripts/ucf_rs.py tests/*.py
python -m unittest discover -s tests -v
python -m unittest discover -s tests -v
python scripts/ucf_rs.py --help
python scripts/ucf_rs.py status --strict
git diff --check
git status --short
```

Foundation A review artifact:

1. Baseline commit and test count.
2. Files changed.
3. Schema and data-policy decisions.
4. HTTP-local boundary behavior.
5. CI matrix changes.
6. Final test count, twice.
7. `git status --short`.
8. Diff summary.
9. Ready/not ready for Foundation B.

### 4B. Foundation B: recoverable source-plus-authority consistency

Start only after Foundation A is committed or otherwise frozen and reviewed.

Scope:

- [ ] Add recoverable crash consistency for source-plus-authority workflows.
- [ ] Add transaction manifests under `.ucf-rs/transactions/`.
- [ ] Keep transaction records outside canonical operation and citation-index
      hashes.
- [ ] Add idempotent recovery that never appends operation or index records
      twice.
- [ ] Add `recover` command with JSON output.
- [ ] Ensure mutating commands recover before reading mutable authority.
- [ ] Ensure read-only commands detect pending transactions.
- [ ] Ensure `status --strict` does not evaluate a half-committed store as
      valid.
- [ ] Add deterministic fault-injection tests for each transaction phase.
- [ ] Add one subprocess crash/restart recovery E2E test.

Commands in scope:

- [ ] `apply-edit`
- [ ] `queue-offline-edit`
- [ ] `replay-offline`
- [ ] Review and include only if multiple-file consistency requires it:
      `activate`, `accept`, `reconcile`, `deactivate`, `reactivate`,
      `import-registry`

Recovery requirements:

- [ ] Failure before preparation leaves original state.
- [ ] Failure after `prepared` recovers deterministically.
- [ ] Failure after source replacement recovers authority.
- [ ] Failure after authority replacement verifies and commits.
- [ ] Repeated recovery is idempotent.
- [ ] Operation and index records are never duplicated.
- [ ] Offline queue and replay archive are not partially consumed.
- [ ] Source is either pre-command or fully committed content.
- [ ] The implementation claims recoverable consistency, not impossible
      cross-file atomicity.

Foundation B validation:

```bash
python -m py_compile scripts/ucf_rs.py tests/*.py
python -m unittest discover -s tests -v
python -m unittest discover -s tests -v
python scripts/ucf_rs.py --help
python scripts/ucf_rs.py status --strict
git diff --check
git status --short
```

Foundation B review artifact:

1. Foundation A commit or frozen baseline.
2. Files changed.
3. Transaction invariant.
4. Recovery behavior by phase.
5. Commands covered.
6. Fault-injection and subprocess recovery tests.
7. Final test count, twice.
8. Remaining limitations.
9. `git status --short`.
10. Diff summary.
11. Ready/not ready for UCF-Yjs Phase 0.

Foundation completion does not authorize UCF-Yjs M1. It only unblocks M0
architecture work and spikes.

## 5. Phase 0: Architecture decision lock

Goal: settle the unresolved decisions that would otherwise cause rework.

Create or update:

```text
docs/TRD.md
docs/authority-planes.md
docs/protocol.md
docs/checkpoint.md
docs/provider-contract.md
docs/domain-contract.md
docs/schema-evolution.md
docs/security.md
```

Required decisions:

- [ ] Authority plane model: collaborative data, semantic log, projections,
      acceptance, provider, and awareness.
- [ ] Command envelope canonical JSON.
- [ ] Outcome envelope canonical JSON.
- [ ] `live_version` digest bytes.
- [ ] `checkpoint_id` digest bytes based on an actor-neutral accepted
      domain projection, never on a capability-filtered caller view.
- [ ] Command frontier representation using workspace sequence and outcome-chain
      hash for MVP.
- [ ] Durable semantic log location and retention.
- [ ] Projection rebuild contract.
- [ ] Idempotency behavior.
- [ ] Raw editor transaction policy.
- [ ] Offline draft edit versus semantic command behavior.
- [ ] Forward-only checkpoint restore behavior.
- [ ] Canonical serialization rules.
- [ ] Schema evolution and mixed-client behavior.
- [ ] Local provider retention mode.
- [ ] Privacy and publication policy dimensions: retention, visibility,
      exportability, source/evidence-text disclosure, diagnostic redaction,
      checkpoint sharing, and provider backups.
- [ ] Trusted-client threat model.
- [ ] Non-JavaScript transport choice.

Acceptance gate:

- [ ] The documents explicitly state that Yjs convergence is not semantic
      acceptance.
- [ ] The documents explicitly state that provider persistence is not authority.
- [ ] The documents explicitly state that commands and outcomes are not solely
      authoritative inside `Y.Doc`.
- [ ] The documents define checkpoints as accepted manifests, not provider
      snapshots or in-place rewind points.
- [ ] The checkpoint digest can be computed from documented,
      actor-neutral fields.
- [ ] Capability-filtered agent views are excluded from checkpoint identity.
- [ ] Any agent-view digest retained in a checkpoint is explicitly
      non-identity verification metadata for a canonical actor-neutral view.
- [ ] The live version can be computed from documented fields.
- [ ] Every command has a deterministic outcome path.
- [ ] UCF-Yjs has no source-code, runtime, storage-schema, transaction-format,
      JSONL-layout, or canonical-hash dependency on UCF-RS.
- [ ] No Phase 1 package scaffold, GUI, or Velt implementation is started.
- [ ] M1 requires an explicit approval after M0 review.

## 6. Phase 1: Scaffold protocol-first MVP

Goal: create only the packages required for the vertical slice.

Initial layout:

```text
ucf-yjs/
  package.json
  tsconfig.json
  packages/
    protocol/
    core/
    command-processor/
    semantic-log/
    projections/
    checkpoint-store/
    provider-memory/
    provider-local/
    domain-citations/
    cli/
  tests/
    conformance/
    convergence/
    e2e/
  docs/
```

Do not create placeholder packages for SDK, MCP, GUI, Velt, or general domain
SDK before they are needed.

Implementation requirements:

- [ ] TypeScript strict mode.
- [ ] Deterministic canonical JSON helper.
- [ ] Domain-separated hash helper.
- [ ] Shared schema constants.
- [ ] Command and outcome types.
- [ ] Stable error/outcome codes.
- [ ] Durable semantic log skeleton.
- [ ] Projection rebuild skeleton.
- [ ] Checkpoint store skeleton.
- [ ] In-memory provider.
- [ ] Local filesystem provider.
- [ ] Basic CLI command runner.

Validation:

```bash
npm test
npm run build
```

If the project chooses a different package manager, document the exact command
equivalents before implementation.

## 7. Phase 2: Command processor

Goal: one logical semantic processor per workspace.

Implement:

- [ ] `submitCommand(command)`.
- [ ] command schema validation.
- [ ] capability validation.
- [ ] duplicate `command_id` handling.
- [ ] duplicate `idempotency_key` handling.
- [ ] duplicate idempotency key with different payload conflict.
- [ ] observed live-version or checkpoint validation.
- [ ] Yjs transaction wrapper.
- [ ] command record append to durable semantic log.
- [ ] outcome record append to durable semantic log.
- [ ] workspace sequence and outcome-chain hash.
- [ ] deterministic `committed`, `rejected`, and `conflict` outcomes.
- [ ] recovery detection for command without outcome.

Rules:

- One command receives exactly one outcome.
- Duplicate command IDs return the original outcome.
- Invalid commands do not partially mutate.
- Projection state is rebuildable and must not become permanent truth.
- The command processor never calls provider-specific APIs except through the
  provider interface.

Tests:

- [ ] Duplicate command ID.
- [ ] Duplicate idempotency key.
- [ ] Duplicate idempotency key with a different payload.
- [ ] Invalid command no partial mutation.
- [ ] Stale observed version.
- [ ] Command record and outcome survive reload.

## 8. Phase 3: Citation reducer

Goal: implement the reference domain without becoming a generic evidence graph.

Commands:

- [ ] `workspace.create`
- [ ] `document.create`
- [ ] `document.replace_range`
- [ ] `citation.activate`
- [ ] `citation.resolve`
- [ ] `citation.accept_current`
- [ ] `citation.deactivate`
- [ ] `checkpoint.create`
- [ ] `agent_view.get`

Reducer requirements:

- [ ] Use Yjs RelativePositions for citation anchors.
- [ ] Translate anchors to absolute ranges for agent views.
- [ ] Store accepted evidence hash.
- [ ] Recompute current evidence hash after edits.
- [ ] Mark changed evidence as `changed_unaccepted`.
- [ ] Treat anchor deletion as `missing` or `anchor_unresolved`.
- [ ] Treat ambiguous recovery as explicit conflict.
- [ ] Never accept changed evidence implicitly.

Tests:

- [ ] Activate citation over selection.
- [ ] Edit before citation preserves valid status.
- [ ] Edit inside citation marks `changed_unaccepted`.
- [ ] Accept current returns valid status.
- [ ] Delete citation target reports missing/unresolved.
- [ ] Boundary insert follows documented association policy.

## 9. Phase 4: Convergence and local persistence

Goal: prove UCF-Yjs is actually a shared-state system, not a local API with Yjs
inside it.

Implement:

- [ ] In-memory provider update exchange.
- [ ] Local provider save/load.
- [ ] Provider-neutral export/import.
- [ ] Compaction or snapshot reload path.
- [ ] Agent-view digest comparison across replicas.
- [ ] Projection rebuild from Yjs state plus semantic log.

Tests:

- [ ] Reordered updates converge.
- [ ] Duplicate updates are harmless.
- [ ] Offline edits converge after reconnection.
- [ ] Relative anchors agree after concurrent inserts.
- [ ] Agent views match after update exchange.
- [ ] Local reload preserves command records, outcomes, and checkpoints.
- [ ] Command committed but projection rebuild interrupted recovers
      deterministically.
- [ ] Yjs update persisted but semantic outcome missing returns stable recovery
      result.

## 10. Phase 5: Checkpoints

Goal: make acceptance durable and distinct from live convergence.

Implement:

- [ ] `checkpoint.create`.
- [ ] checkpoint manifest.
- [ ] checkpoint digest.
- [ ] command frontier digest from workspace sequence and outcome-chain hash.
- [ ] accepted resource digest.
- [ ] actor-neutral accepted-projection digest.
- [ ] optional agent-view verification digest excluded from checkpoint identity.
- [ ] checkpoint list and inspect CLI output.
- [ ] `checkpoint.open_readonly`.
- [ ] `checkpoint.fork`.
- [ ] `checkpoint.reapply`.

Tests:

- [ ] Checkpoint digest is reproducible after reload and is identical
      for actors with different view capabilities.
- [ ] Provider snapshot restoration does not imply checkpoint acceptance.
- [ ] Live edits after checkpoint do not mutate checkpoint digest.
- [ ] `citation.accept_current` can precede `checkpoint.create`.
- [ ] checkpoint can reference optional provider snapshot without depending on
      provider semantics.
- [ ] checkpoint fork and reapply are forward operations, not in-place CRDT
      history rewinds.

## 11. Phase 6: CLI and non-JavaScript agent transport

Goal: prove agents do not need raw Yjs access for normal operation.

CLI commands:

```text
ucf-yjs workspace create
ucf-yjs document create
ucf-yjs document replace-range
ucf-yjs citation activate
ucf-yjs citation resolve
ucf-yjs citation accept-current
ucf-yjs checkpoint create
ucf-yjs agent-view
ucf-yjs status
```

Transport:

- [ ] Choose stdio JSONL, local HTTP, or both.
- [ ] Use the same command/outcome envelopes as the CLI.
- [ ] Return stable codes.
- [ ] Enforce maximum request size if HTTP exists.
- [ ] Keep HTTP loopback-only unless explicitly configured unsafe.

Tests:

- [ ] CLI and direct processor produce equivalent outcomes.
- [ ] Agent-view JSON is deterministic.
- [ ] Non-JavaScript client can submit command envelope.
- [ ] Raw CRDT bytes are unnecessary for standard citation workflow.

## 12. Phase 7: Optional workbench

Start only after Phases 1-6 pass.

Goal: minimal visual proof, not product polish.

Implement:

- [ ] Open local workspace.
- [ ] Show document text.
- [ ] Show citation overlays.
- [ ] Submit typed commands through the same protocol.
- [ ] Show command outcomes and allowed actions.
- [ ] Show checkpoint status.

Rules:

- Workbench must not mutate Yjs domain structures directly.
- Workbench must not introduce a second state machine.
- Workbench must pass the same vertical slice as CLI.

## 13. Phase 8: Optional Velt provider

Start only after local provider conformance passes.

Goal: prove provider replaceability.

Implement:

- [ ] Velt provider adapter behind provider interface.
- [ ] Authenticated actor mapping.
- [ ] Provider sync status.
- [ ] Offline/resync tests.
- [ ] Provider snapshot reference from checkpoint.
- [ ] Secret handling.

Rules:

- Velt APIs must not leak into protocol, reducer, or command processor packages.
- Velt snapshot restoration must not imply accepted checkpoint.
- Velt outage must not alter domain semantics.

## 14. Phase 9: Evidence-first extension gate

Do not implement Cite2Site-style evidence graph until this gate passes.

Required proof:

- [ ] One concrete reverse-impact workflow.
- [ ] User value is stronger than citation-only status.
- [ ] SourceResource, SourceRepresentation, EvidenceFragment, and Citation
      identity rules are approved.
- [ ] Lineage remains explicit and non-inferred.
- [ ] Added complexity does not compromise UCF-Yjs core protocol.

Possible future commands:

```text
source.register
source.observe
evidence.capture
evidence.inspect-impact
evidence.propose-successor
evidence.accept-successor
```

## 15. Review requirements

After each completed feature or phase:

- [ ] Perform a local review before reporting completion.
- [ ] Check that no product boundary drift occurred.
- [ ] Check that raw Yjs is not exposed as the normal agent API.
- [ ] Check that convergence is not treated as acceptance.
- [ ] Check that provider state is not treated as domain authority.
- [ ] Check that commands and outcomes are not solely authoritative inside
      `Y.Doc`.
- [ ] Check that projections are rebuildable and not mutable authority.
- [ ] Check that checkpoint operations are forward-only.
- [ ] Check that actor and command attribution are durable.
- [ ] Check that tests cover the new behavior.

Review output should list:

- confirmed issues;
- architectural risks;
- intentional tradeoffs;
- missing context;
- verification commands and results.

## 16. Validation gates

Run before reporting a phase complete:

```bash
npm run build
npm test
```

Run for protocol/core changes:

```bash
npm run test:conformance
npm run test:convergence
```

Run for CLI/transport changes:

```bash
npm run test:e2e
```

If commands differ, update this plan before implementation proceeds.

## 17. Completion report format

For every phase, report:

1. Phase objective.
2. Files changed.
3. Commands implemented.
4. Protocol or schema changes.
5. Tests added.
6. Verification commands and results.
7. Architectural review findings.
8. Remaining limitations.
9. Whether the next phase is unblocked.

## 18. Initial Codex task prompt

Use this prompt for the first execution pass after the UCF-RS repository and
local UCF-Yjs planning location are approved:

```text
Prepare UCF-Yjs as the single long-term project, with UCF-RS hardening as an
independent behavioral baseline and conformance oracle.

Execute only:
1. UCF-RS Foundation A.
2. UCF-RS Foundation B, after Foundation A is reviewed or frozen.
3. UCF-Yjs Phase 0 architecture documents and bounded spikes.

Stop after M0. Do not scaffold or implement M1 packages without a new explicit
approval.

Rules:
- Harden UCF-RS first in two reviewable changes.
- Do not copy or depend on UCF-RS source code, Python runtime, JSONL layouts,
  transaction format, storage schema, or canonical hashes in UCF-Yjs.
- Protocol first.
- No GUI.
- No Velt.
- No Cite2Site v2 implementation.
- No Yjs, Velt, Git, W3C, editor bindings, or provider integrations inside
  UCF-RS hardening.
- No broad UCF-RS decomposition.
- Raw Yjs updates are not the normal public agent contract.
- CRDT convergence is not semantic acceptance.
- Provider snapshots are not accepted checkpoints.
- Commands and outcomes are durable semantic-log records, not solely authority
  inside Y.Doc.
- Projections are rebuildable, not permanent truth.
- Checkpoint restore is forward-only: open readonly, fork, or reapply.
- Checkpoint identity must use an actor-neutral accepted projection and must not
  depend on a capability-filtered agent view.
- Define retention, visibility, exportability, disclosure, redaction,
  checkpoint-sharing, and provider-backup policy separately.
- Define canonical serialization and schema evolution before implementation.
- Preserve actor and command attribution.
- Add tests with each UCF-RS behavior.
- After each completed foundation change, perform a local architecture/code
  review before continuing.

Deliver for UCF-RS Foundation A:
- guardrails/docs/CI patch
- storage schema documentation
- data-handling policy
- local HTTP hardening
- CI matrix changes
- validation and review report

Deliver for UCF-RS Foundation B:
- recoverable-consistency patch
- transaction and recovery documentation
- fault-injection tests
- subprocess crash/restart E2E
- validation and review report

Deliver for UCF-Yjs M0 only:
- docs/TRD.md
- docs/authority-planes.md
- docs/protocol.md
- docs/checkpoint.md
- docs/provider-contract.md
- docs/domain-contract.md
- docs/schema-evolution.md
- docs/security.md
- Yjs convergence spike report
- RelativePosition behavior report
- canonical serialization proposal
- live-version digest proposal
- actor-neutral checkpoint digest proposal
- offline draft-versus-semantic-command proposal
- raw-editor mutation recommendation
- open decision list
- M0 acceptance report

Do not deliver:
- package.json
- tsconfig.json
- TypeScript package scaffolds
- providers
- command processor implementation
- reducers
- CLI implementation
- conformance implementation
- GUI
- Velt
- MCP

End with a direct M1 ready/not-ready recommendation.
```

## 19. Final recommendation

Build UCF-Yjs only if the team accepts the foundation-first and protocol-first
sequence. UCF-RS hardening is mandatory foundation work, but it must stay
bounded to reliability, storage, data-handling, HTTP-local safety, and CI. If
the team requires immediate GUI collaboration or immediate Velt integration,
pause and run a spike instead. Starting with UI or provider integration would
undermine the reason UCF-Yjs was selected over Cite2Site v2 as the long-term
project.
