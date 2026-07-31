# UCF-Yjs MVP One-Shot Kickoff Prompt

You are the principal implementation agent for the UCF-Yjs MVP.

Execute the complete local, protocol-first MVP in one continuous run. This prompt is the explicit authorization to proceed from UCF-RS Foundation A and Foundation B through UCF-Yjs M0 and the local MVP without pausing for additional approval, provided every feature clears its tests and the installed `review-agent` skill.

## 1. Authoritative inputs

Read these before changing code:

1. `CODEX_UCF_YJS_SINGLE_PROJECT_PLAN_REVISED.md`
2. `UCF-Yjs-TRD-Single-Long-Term-Project-REVISED.md`
3. The current UCF-RS `README.md`, architecture documentation, command documentation, CI configuration, implementation, and tests
4. The installed `review-agent` skill instructions

Precedence for this execution:

```text
this kickoff prompt
→ revised Codex plan
→ revised UCF-Yjs TRD
→ current repository contracts and tests
→ conservative documented inference
```

Do not silently resolve a genuine contradiction. Prefer the narrower interpretation that preserves authority boundaries, data integrity, deterministic outcomes, and backward compatibility. Record the decision in the implementation log.

## 2. Objective

Deliver:

1. A hardened, independently valid UCF-RS behavioral baseline.
2. A new UCF-Yjs local MVP implementing:

   * provider-neutral Yjs collaboration;
   * typed commands and outcomes;
   * a durable semantic log;
   * rebuildable projections;
   * actor-neutral accepted checkpoints;
   * in-memory and local persistence providers;
   * a citation reference reducer;
   * deterministic agent views;
   * a CLI or headless transport;
   * convergence, conformance, recovery, and end-to-end tests.

The MVP is complete only when this workflow passes:

```text
create workspace
→ open one document through two clients
→ activate a citation over an explicit selection
→ disconnect one client
→ apply concurrent edits through both clients
→ deliver updates in different orders
→ verify converged document state
→ resolve identical citation anchors on both replicas
→ classify changed evidence as changed_unaccepted
→ accept the current evidence through a typed command
→ create an actor-neutral accepted checkpoint
→ return identical semantic outcomes
→ produce deterministic capability-aware agent views
→ reload through the local provider
→ reproduce the checkpoint and projection
```

## 3. Non-negotiable architecture

### UCF-RS boundary

UCF-RS is an independent behavioral baseline and conformance oracle.

UCF-Yjs must not depend on:

* UCF-RS Python source code;
* the UCF-RS runtime;
* UCF-RS JSONL layouts;
* UCF-RS transaction manifests;
* UCF-RS storage schemas;
* UCF-RS operation or citation-index hashes;
* UCF-RS canonical serialization.

Behavior fixtures and expected outcomes may be translated into UCF-Yjs conformance tests. Implementation internals may not be copied as dependencies.

### Authority planes

Keep these planes separate:

| Plane                | Owns                                                                 |
| -------------------- | -------------------------------------------------------------------- |
| Collaborative data   | Live convergent document state and relative anchors                  |
| Durable semantic log | Commands, outcomes, actors, idempotency decisions, semantic ordering |
| Projection           | Citation status, allowed actions, agent views, reports, indexes      |
| Acceptance           | Content-addressed accepted checkpoint manifests                      |
| Provider             | Persistence and synchronization                                      |
| Awareness            | Ephemeral presence and connection state                              |

A single `Y.Doc` must not become the sole durable authority for commands, outcomes, audit, or accepted checkpoints.

### Required invariants

* Yjs convergence is structural, not semantic acceptance.
* Raw Yjs updates are not the normal public agent contract.
* All semantic operations use the same typed command processor.
* Every accepted command receives exactly one deterministic outcome.
* Duplicate command IDs return the original outcome.
* Duplicate idempotency keys with different payloads return a typed conflict.
* Invalid commands do not partially mutate semantic state.
* Projections are rebuildable and are never mutable authority.
* Provider snapshots are not accepted checkpoints.
* Checkpoint restoration is forward-only: read-only open, fork, or reapply.
* Checkpoint identity is actor-neutral and capability-independent.
* Capability-filtered agent-view digests never define checkpoint identity.
* Anchor survival never implies evidence acceptance.
* Changed evidence is never accepted implicitly.
* Multiple legitimate target candidates remain explicitly ambiguous.
* Velt, Git, W3C, GUI, MCP, and the Cite2Site evidence graph are outside this MVP.
* The MVP uses the trusted-client threat model documented in the TRD.
* Do not commit, push, publish, create a repository, or open a pull request unless the session already contains explicit authorization. When commits are authorized, create one reviewed commit per completed feature.

## 4. Autonomous execution behavior

Do not pause for ordinary implementation choices. Select the smallest option that satisfies the revised plan, TRD, existing contracts, and tests.

Stop only when:

* the required repository or authority documents are missing;
* unrelated uncommitted changes overlap files that must be modified;
* an architectural requirement is impossible to satisfy without changing a non-negotiable invariant;
* a destructive or externally publishing operation would require authorization;
* the installed review skill reports an unresolved critical issue that cannot be corrected locally.

When a choice remains open, implement the simplest reversible local-MVP option and record:

```text
decision
alternatives considered
reason selected
compatibility consequences
future extension point
```

Maintain a local implementation log, such as:

```text
docs/implementation-log.md
```

Do not place generated review transcripts in canonical authority data.

## 5. Mandatory review-agent gate

A feature is not complete when its code is written. It is complete only after the following loop succeeds:

```text
implement one feature
→ run targeted tests
→ run all relevant regression tests
→ invoke the installed review-agent skill
→ inspect every finding
→ fix findings
→ rerun tests
→ rerun review-agent
→ record the accepted review result
→ proceed to the next feature
```

Invoke the installed `review-agent` skill using its documented interface after every feature listed in Section 7.

For each review, provide the review agent with:

* the feature objective;
* the architecture invariants relevant to it;
* the exact diff;
* tests added or changed;
* verification output;
* known limitations.

Review disposition:

* **Critical:** must be fixed before continuing.
* **High:** must be fixed before continuing.
* **Medium:** must be fixed when it affects correctness, authority boundaries, determinism, security, data loss, protocol compatibility, or test validity. Otherwise document the intentional tradeoff.
* **Low:** fix when cheap; otherwise record.
* **Missing context:** resolve from the authoritative documents or repository before continuing.
* **False positive:** document why, with concrete code or test evidence.

Never batch several unreviewed features together. A later broad review does not replace the per-feature gate.

## 6. Baseline and workspace isolation

Before editing:

```bash
git status --short
git branch --show-current
git rev-parse HEAD
```

Record the exact baseline.

For UCF-RS run:

```bash
python -m py_compile scripts/ucf_rs.py tests/*.py
python -m unittest discover -s tests -v
python scripts/ucf_rs.py --help
git diff --check
```

Run `status --strict` against a known initialized valid fixture. Do not treat failure caused only by running outside an initialized project as a product regression.

Record:

* actual test count;
* supported Python versions;
* current CI platforms;
* current mutation commands;
* current authority files;
* current source-plus-authority write order;
* current working-tree status.

Create the UCF-Yjs workspace only after UCF-RS Foundation B passes. Use the approved project location or a local sibling directory named `ucf-yjs`. Do not create a remote repository.

## 7. Feature sequence

Complete features in this order. Run the mandatory review-agent gate after every numbered feature.

# Part A — UCF-RS Foundation A

## Feature A1 — Storage and behavioral contracts

Implement:

* `docs/storage-schemas.md`;
* authoritative-versus-derived file definitions;
* canonical hashing boundaries;
* schema compatibility behavior;
* unknown and unsupported schema behavior;
* offline queue and replay archive data classification;
* a UCF-RS behavior/conformance matrix for UCF-Yjs to reproduce independently.

Do not change canonical hashes.

Acceptance:

* documentation matches actual implementation;
* no production behavior changes unless a contradiction is uncovered;
* existing tests pass twice.

## Feature A2 — Data policy

Document independently:

* retention;
* visibility;
* export;
* source/evidence-text disclosure;
* diagnostic redaction;
* backups;
* deletion;
* absence of encryption-at-rest guarantees;
* trusted local threat model.

Acceptance:

* `.ucf-rs/`, offline queue, replay archive, and generated projections are classified;
* public diagnostics omit source text by default;
* no undocumented privacy promise is introduced.

## Feature A3 — Local HTTP guardrails

Implement:

* maximum request-body size;
* invalid and negative `Content-Length` rejection;
* HTTP 413 for oversized bodies;
* loopback-only binding by default;
* explicit unsafe remote opt-in with a warning;
* documentation stating no authentication or TLS.

Do not build remote authentication.

Acceptance:

* focused HTTP tests;
* CLI help updated;
* all existing tests pass.

## Feature A4 — CI matrix

Implement CI for:

* Ubuntu and Windows;
* Python 3.10 and 3.12;
* compilation;
* full unit discovery;
* CLI help;
* a valid `status --strict` fixture;
* subprocess lock behavior where supported.

Acceptance:

* workflow syntax is valid;
* local equivalent commands pass;
* no new lint or type dependency is introduced merely to expand scope.

# Part B — UCF-RS Foundation B

## Feature B1 — Transaction primitives

Implement a recoverable write-ahead transaction mechanism outside canonical operation/index hashes.

Required phases:

```text
prepared
source_applied
authority_applied
committed
```

Requirements:

* prepared replacements are written in destination directories;
* file content is flushed before phase advancement;
* replacements use `os.replace`;
* parent-directory sync is attempted where supported;
* phase changes are atomic;
* expected and intended hashes are recorded;
* transaction data is sufficient for deterministic idempotent completion;
* malformed transactions fail closed.

Do not claim impossible cross-file atomicity. Claim recoverable consistency.

## Feature B2 — Source-plus-authority integration

Apply the transaction protocol to:

* `apply-edit`;
* `queue-offline-edit`;
* `replay-offline`.

Review other mutating commands and include them only where multiple-file partial state is possible.

Acceptance:

* records are built before mutation;
* no operation or citation-index record can be appended twice;
* queue and replay archive consumption is all-or-recoverable;
* evidence is never implicitly accepted.

## Feature B3 — Recovery surface

Implement:

* `recover_pending_transactions(...)`;
* a `recover` CLI command;
* structured JSON recovery output;
* recovery under the existing authority lock;
* mutation-time recovery before mutable reads;
* read-only detection of pending transactions;
* `status --strict` refusal to validate half-committed state.

Acceptance:

* repeated recovery is idempotent;
* already completed phases are recognized by actual hashes;
* unrecoverable divergence returns a stable typed diagnostic.

## Feature B4 — Failure and restart tests

Add deterministic phase injection and tests for:

* failure before preparation;
* failure after `prepared`;
* failure after source replacement;
* failure after authority replacement;
* repeated recovery;
* no duplicate records;
* no partial queue consumption;
* source is old or fully committed;
* subprocess crash/restart E2E;
* cross-process lock regression.

Run the complete UCF-RS suite twice.

After Feature B4 passes review, record the UCF-RS baseline as complete. UCF-Yjs may reproduce its behaviors, but may not import its implementation.

# Part C — UCF-Yjs M0 decisions and spikes

## Feature C1 — Authority and protocol decisions

Create:

```text
docs/TRD.md
docs/authority-planes.md
docs/protocol.md
docs/domain-contract.md
docs/provider-contract.md
```

Resolve and document:

* one logical semantic command processor per workspace;
* command and outcome envelopes;
* typed outcome taxonomy;
* actor attribution;
* idempotency;
* semantic log ordering;
* projection rebuild rules;
* provider boundary;
* awareness boundary;
* exact public versus internal APIs.

## Feature C2 — Canonicalization, live version, and checkpoints

Create:

```text
docs/checkpoint.md
docs/canonicalization.md
```

Define exact canonical bytes for:

* command payload digests;
* semantic-log record hashes;
* outcome-chain hashes;
* projection digests;
* `live_version`;
* `checkpoint_id`.

Checkpoint identity must include:

* workspace identity;
* domain and reducer versions;
* parent checkpoint when present;
* semantic command frontier;
* document digests;
* anchor projection digest;
* actor-neutral accepted projection digest;
* policy fields that alter accepted-state meaning.

Checkpoint identity must exclude:

* capability-filtered agent views;
* awareness and presence;
* provider-specific snapshot IDs;
* connection state;
* caller display preferences;
* non-deterministic timestamps unless explicitly normalized.

An optional canonical full-view verification digest may exist outside checkpoint identity.

## Feature C3 — Offline, editor, schema, transport, and security decisions

Create:

```text
docs/schema-evolution.md
docs/security.md
docs/offline-semantics.md
```

Decide:

* offline draft CRDT edits versus queued semantic commands;
* speculative semantic command states;
* raw editor transaction classification;
* stale observation handling;
* forward-only checkpoint restore;
* command/outcome retention;
* schema upcasting and mixed-client behavior;
* local provider retention defaults;
* non-JavaScript transport: prefer stdio JSONL for MVP unless repository evidence strongly justifies loopback HTTP;
* policy defaults for retention, visibility, exportability, evidence disclosure, diagnostic redaction, checkpoint sharing, and provider backups.

## Feature C4 — Yjs spikes

Implement bounded disposable spikes proving:

* reordered Yjs updates converge;
* duplicate updates are harmless;
* offline updates converge after exchange;
* RelativePositions resolve identically after synchronization;
* boundary insertion behavior can be specified;
* deleted anchors yield a detectable unresolved state;
* provider-neutral state export/import is feasible.

Turn successful spike assertions into permanent convergence tests later. Do not let spike code become authority accidentally.

M0 passes only when every open decision required by the revised TRD has a documented answer and the review agent reports no unresolved architectural blocker.

# Part D — UCF-Yjs local MVP

## Feature D1 — Minimal project scaffold

Create only:

```text
package.json
tsconfig.json
packages/protocol/
packages/core/
packages/command-processor/
packages/semantic-log/
packages/projections/
packages/checkpoint-store/
packages/provider-memory/
packages/provider-local/
packages/domain-citations/
packages/cli/
tests/conformance/
tests/convergence/
tests/e2e/
docs/
```

Requirements:

* TypeScript strict mode;
* deterministic scripts:

  * `npm run build`
  * `npm test`
  * `npm run test:conformance`
  * `npm run test:convergence`
  * `npm run test:e2e`
* no empty future packages;
* no GUI, SDK, MCP, Velt, or generic plugin framework.

## Feature D2 — Protocol and canonical serialization

Implement:

* schema-versioned command types;
* schema-versioned outcome types;
* stable codes;
* actor and target types;
* canonical JSON;
* domain-separated hashing;
* schema validation;
* canonical test vectors.

Acceptance:

* semantically identical canonical inputs hash identically;
* unsupported schema versions fail with stable outcomes;
* protocol types contain no provider-specific fields.

## Feature D3 — Durable semantic log

Implement an append-only local semantic log containing:

* immutable commands;
* immutable outcomes;
* actor attribution;
* idempotency decisions;
* workspace sequence;
* previous outcome hash;
* outcome hash.

Requirements:

* one accepted command has exactly one outcome;
* log validation detects corruption, gaps, duplicates, and mismatched hashes;
* a command without an outcome is detected on recovery;
* Yjs is not the sole audit authority.

## Feature D4 — Projection engine

Implement deterministic rebuildable projections from:

```text
converged Yjs state
+ validated semantic log
+ reducer version
+ capability context
```

Initial projections:

* workspace status;
* documents;
* citations;
* conflicts;
* allowed actions;
* bounded agent view.

Requirements:

* projections are never edited as authority;
* rebuild after deletion produces the same canonical output;
* capability filtering changes returned views but not accepted checkpoint identity.

## Feature D5 — Checkpoint store

Implement content-addressed accepted manifests.

Requirements:

* actor-neutral checkpoint identity;
* semantic frontier;
* document digests;
* anchor projection digest;
* accepted projection digest;
* parent relationship;
* schema/reducer versions;
* policy;
* optional provider snapshot reference outside domain meaning;
* open-readonly, fork, and reapply operations;
* no in-place Yjs rewind.

Acceptance:

* reload reproduces checkpoint ID;
* different actor capabilities do not change checkpoint ID;
* altered accepted content changes checkpoint ID;
* provider snapshot restoration alone does not create acceptance.

## Feature D6 — In-memory provider

Implement a deterministic provider used by conformance and convergence tests.

Requirements:

* connect/disconnect;
* update exchange;
* sync completion;
* state export/import;
* duplicate and reordered delivery simulation;
* no domain logic.

## Feature D7 — Local provider

Implement local persistence behind the same provider interface.

Requirements:

* safe save/load;
* provider-neutral export/import;
* compaction or full-state snapshot path;
* restart recovery;
* documented storage and retention behavior;
* same provider conformance suite as memory provider.

## Feature D8 — Command processor

Implement one logical semantic processor per workspace:

```text
validate
→ authorize/capability-check
→ resolve idempotency
→ validate observed state
→ execute one reducer transaction
→ append command/outcome
→ advance semantic frontier
→ rebuild affected projections
→ publish typed result
```

Required outcomes:

```text
committed
rejected
conflict
```

Required conflicts include:

* stale observation;
* duplicate idempotency key with different payload;
* invalid transition;
* ambiguous reference;
* changed evidence requiring review;
* missing target;
* permission denied.

A semantic conflict is not a provider failure.

## Feature D9 — Citation reducer

Implement only these MVP operations:

```text
workspace.create
document.create
document.replace_range
citation.activate
citation.resolve
citation.accept_current
citation.deactivate
checkpoint.create
agent_view.get
status.get
```

Citation requirements:

* stable citation ID;
* accepted evidence hash;
* Yjs RelativePosition start/end anchors;
* explicit boundary association policy;
* current evidence classification;
* statuses including:

  * `valid`
  * `changed_unaccepted`
  * `missing`
  * `ambiguous`
  * `inactive`
* exact evidence validation;
* no heuristic tie-break;
* no automatic lineage;
* no implicit acceptance.

## Feature D10 — Convergence and semantic interaction

Prove:

* concurrent edits converge under different delivery orders;
* duplicate update delivery is harmless;
* anchors resolve identically after sync;
* edits before a citation preserve validity;
* edits inside a citation produce `changed_unaccepted`;
* target deletion produces `missing` or `anchor_unresolved`;
* acceptance occurs only through `citation.accept_current`;
* simultaneous structural convergence and semantic conflict are distinguishable.

## Feature D11 — CLI and non-JavaScript transport

Implement a headless CLI using the same command/outcome envelopes.

Required commands may be grouped ergonomically but must support:

```text
workspace create
document create
document replace-range
citation activate
citation resolve
citation accept-current
citation deactivate
checkpoint create
agent-view
status
```

Use stdio JSONL for the MVP unless M0 selected loopback HTTP.

Requirements:

* deterministic JSON;
* stable exit behavior;
* maximum input size;
* no raw CRDT requirement for normal workflows;
* CLI and direct processor produce equivalent outcomes.

## Feature D12 — Complete vertical-slice E2E

Implement the full MVP workflow from Section 2 across:

* two replicas;
* memory provider;
* local provider;
* direct processor;
* CLI/headless client;
* restart/reload;
* checkpoint reproduction;
* agent-view comparison.

The final E2E must prove:

* identical converged content;
* identical resolved anchors;
* identical semantic frontier;
* identical actor-neutral checkpoint ID;
* deterministic agent views for equal capabilities;
* intentionally different redacted views for different capabilities without checkpoint drift;
* no source text in default diagnostics;
* no raw Yjs bytes required by the agent workflow.

## 8. Validation commands

After every UCF-RS feature, run targeted tests and the relevant complete Python suite.

Before declaring UCF-RS complete:

```bash
python -m py_compile scripts/ucf_rs.py tests/*.py
python -m unittest discover -s tests -v
python -m unittest discover -s tests -v
python scripts/ucf_rs.py --help
git diff --check
git status --short
```

After every UCF-Yjs feature, run targeted tests and the relevant scripts.

Before declaring UCF-Yjs complete:

```bash
npm run build
npm test
npm run test:conformance
npm run test:convergence
npm run test:e2e
git diff --check
git status --short
```

Run the complete UCF-Yjs validation suite twice after the final feature.

Do not suppress, weaken, skip, quarantine, or delete failing tests merely to complete the run.

## 9. Completion artifacts

Maintain:

```text
docs/implementation-log.md
docs/decisions/
docs/reviews/
```

For each feature record:

* objective;
* files changed;
* architectural decisions;
* tests;
* review-agent findings;
* fixes applied;
* accepted tradeoffs;
* remaining limitations;
* resulting gate status.

The final report must contain:

1. Baseline repositories, branches, and commits.
2. UCF-RS Foundation A summary.
3. UCF-RS Foundation B summary.
4. UCF-Yjs M0 decisions.
5. UCF-Yjs MVP package map.
6. Implemented command and outcome schemas.
7. Authority-plane implementation map.
8. Semantic-log validation model.
9. Projection rebuild model.
10. Checkpoint identity definition.
11. Provider conformance results.
12. Citation state-machine behavior.
13. CLI/transport behavior.
14. Full vertical-slice evidence.
15. Per-feature review-agent results.
16. Complete validation outputs and test counts.
17. Known limitations.
18. Deferred work.
19. `git diff --stat`.
20. `git status --short`.
21. Direct verdict:

    * MVP complete and review-ready;
    * MVP partially complete with exact blockers; or
    * MVP not viable under the current architecture.

## 10. Explicit exclusions

Do not implement during this one-shot:

* GUI or editor workbench;
* Velt;
* MCP;
* Git integration;
* W3C Web Annotation;
* Cite2Site v2;
* evidence graph entities;
* arbitrary domain plugins;
* hostile-client or Byzantine security;
* hosted service deployment;
* remote authentication;
* package publication;
* repository creation;
* pull requests.

These exclusions are not failures. They are post-MVP work.

## 11. Final operating instruction

Proceed continuously through the ordered feature list.

After each feature:

1. test;
2. invoke `review-agent`;
3. fix;
4. retest;
5. rerun `review-agent`;
6. record;
7. continue.

Do not ask for confirmation between features. Do not declare success based on partial scaffolding. The result must be a working, locally persistent, provider-neutral, agent-operable UCF-Yjs citation MVP with a hardened independent UCF-RS conformance baseline.
