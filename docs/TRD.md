# Technical Requirements Document: UCF-Yjs Protocol-First Long-Term Project

**Document status:** Active; M0 and M1 complete, M2 approved for planning
**Product:** UCF-Yjs
**Decision:** UCF-Yjs is the single long-term architecture to build
**Architecture:** Protocol-first, provider-neutral shared-state control plane over Yjs
**Completed milestones:** M0 local MVP tagged `0.1.0`; M1 durable local protocol runtime merged to `main` in PR #2
**Current milestone:** M2 editor/workbench
**Next milestone:** M3 optional Velt provider
**Initial provider:** In-memory and local persistence providers
**Deferred providers and adapters:** Velt, MCP, Git/W3C, and hosted integrations after their gates
**Reference domain:** Source-clean citation lifecycle
**Required baseline:** Independently hardened UCF-RS behavior and conformance; no runtime or storage dependency
**Non-selected peer architecture:** Cite2Site v2 remains a domain-design input, not a separate build in this plan

## 1. Executive summary

UCF-Yjs is the selected long-term project because it provides one shared state
and one typed protocol for humans, agents, CLIs, SDKs, APIs, MCP clients, and
graphical clients.

The program has completed its local MVP, now designated **M0**. M0 proved the
narrow citation vertical slice: provider-neutral Yjs convergence, typed commands
and outcomes, durable semantic history, rebuildable projections, explicit
acceptance, actor-neutral checkpoints, local restart, and bounded agent views.

The program has also completed **M1: durable local protocol runtime**. M1 did
not rebuild the MVP. It froze compatibility contracts and made the complete
local workspace recoverable as one logical authority across:

```text
collaborative Yjs state
+ semantic log and idempotency decisions
+ citation state and anchors
+ checkpoint manifests and retained documents
+ processor and schema versions
```

M1 also turned the headless interface into a real persistent runtime, created
the UCF-RS/UCF-Yjs behavioral conformance corpus, validated corruption and
migration paths, and prevented consumers from depending on private package
internals. PR #2 merged the completed milestone to `main`; the proposed M1
release tag is `0.2.0-m1` and has not yet been created.

The current milestone is **M2: editor/workbench**. M2 opens and renders a real
M1 workspace while continuing to submit all semantic mutations through public
typed commands. Velt, MCP, Git/W3C, Cite2Site-style evidence expansion, hosted
deployment, and broad packaging remain separately gated.

A central M1 contract is now delivered and remains normative: pure reads such
as `status.get` and `agent_view.get` are observational. They do not advance the
semantic frontier, `live_version`, or checkpoint identity. Optional read audit
belongs in a separate observation log.

## 2. Decision rationale

Three architectures were considered:

- UCF-RS: strongest near-term local authority baseline.
- Cite2Site v2: strongest evidence-first product model.
- UCF-Yjs: strongest long-term shared-state platform.

UCF-Yjs is selected because collaboration, agent participation, typed intent,
and shared live state are broader platform needs than local-only traceability or
product-specific evidence indexing.

UCF-RS hardening remains necessary because the source-clean citation behavior
used as a comparison baseline must be reliable. The existing local runtime
captures source-clean operation, explicit acceptance, conservative ambiguity,
and recoverable-consistency requirements that UCF-Yjs must test independently.

UCF-RS is a behavioral baseline and conformance oracle only. UCF-Yjs must not
depend on UCF-RS source code, the Python runtime, JSONL layouts, transaction
manifests, storage schemas, operation/index hashes, or canonical serialization.
The two implementations may share behavior fixtures and expected outcomes, but
not authority storage or implementation internals.

The selected project must still incorporate the best lessons from the other two:

- From UCF-RS: source-clean operation, explicit acceptance, deterministic status,
  append-only audit records, conservative ambiguity handling, local-first
  execution, and recoverable consistency.
- From Cite2Site v2: separate citation identity from evidence identity, avoid
  locator-as-identity, make reverse impact possible as a domain capability, and
  never infer lineage from matching text or location alone.

## 3. Problem statement

Without UCF-Yjs, each client type risks inventing its own state model:

```text
GUI mutates editor state
CLI mutates files
SDK calls private APIs
MCP exposes a separate resource model
agents patch ad hoc JSON
provider snapshots are mistaken for domain acceptance
```

That creates inconsistent authority, weak auditability, and fragile agent
coordination.

Yjs solves convergence, not product semantics. A converged CRDT document may
still contain unaccepted evidence changes, unauthorized edits, stale commands,
ambiguous anchors, or domain conflicts. UCF-Yjs must make those states explicit.

## 4. Goals

- Preserve the signed-off M0 protocol and authority-plane architecture.
- Maintain UCF-RS as an independent behavioral baseline and conformance oracle.
- Freeze command, outcome, frontier, canonicalization, checkpoint, snapshot, and
  provider contracts before broader client adoption.
- Make the complete local UCF-Yjs workspace recoverable after process failure.
- Provide one persistent workspace runtime and CLI entrypoint.
- Keep raw Yjs updates out of the public agent contract.
- Use Yjs for convergence and relative anchoring.
- Use domain reducers for semantic validation and classification.
- Preserve source-clean citation behavior and explicit acceptance.
- Distinguish live state from accepted checkpoints.
- Preserve durable actor, command, outcome, and migration attribution.
- Produce deterministic bounded JSON projections for agents.
- Make observational reads independent of semantic frontier identity.
- Support local-first operation and provider-neutral persistence.
- Provide versioned behavioral conformance fixtures for UCF-RS and UCF-Yjs.
- Validate schema migration, corruption, locking, and recovery behavior.
- Protect public package boundaries before external consumption.
- Keep Velt and every later integration replaceable.
- Establish a path for M2 editor work without introducing a second state
  machine.

## 5. Non-goals

- Replacing or absorbing the independently hardened UCF-RS oracle.
- Building Cite2Site v2 as a separate product in this plan.
- Reopening or bypassing completed M1 durability and authority contracts without a documented contradiction.
- Starting with Velt or any hosted provider as canonical authority.
- Exposing raw Yjs binary updates as the normal API for agents.
- Treating CRDT convergence as semantic acceptance.
- Inferring lineage from text equality, locator proximity, or path reuse.
- Supporting malicious Byzantine clients in M1.
- Providing universal semantic merge.
- Building W3C Web Annotation compatibility in M1.
- Building Git-native authority in M1.
- Supporting arbitrary domain plugins before the citation domain and M1 runtime are proven.
- Depending on UCF-RS source code, Python runtime, JSONL storage layouts,
  transaction format, or canonical hashes.

## Required UCF-RS Conformance Baseline

**Status:** Complete and merged. This section remains normative for the oracle
boundary and historical provenance. New UCF-RS behavior is a change to the
oracle and requires an explicit fixture/version review; it is not ordinary
feature growth.

UCF-RS hardening is part of this program, but it remains an independent
implementation. Its purpose is to establish a reliable comparison baseline for
source-clean citation behavior and recoverable local operation.

The completed work was split into two reviewable changes.

### Foundation A: guardrails, contracts, and CI

- storage schema documentation;
- canonical hashing-boundary documentation without hash changes;
- data-handling policy for `.ucf-rs/`, offline queues, replay archives,
  diagnostics, backups, and generated projections;
- local HTTP request-size and loopback-only guardrails;
- CI across supported Python versions and Windows lock behavior.

### Foundation B: recoverable consistency

- recoverable crash consistency for commands that mutate source projection and
  authority files;
- write-ahead transaction manifests outside canonical operation and index
  hashes;
- idempotent recovery that never duplicates operation or index records;
- `recover` command with structured output;
- `status --strict` refusal to validate half-committed state;
- deterministic phase fault injection;
- subprocess crash/restart recovery testing.

Constraints:

- Do not add Yjs, Velt, Git, W3C, or editor bindings to UCF-RS.
- Do not perform broad decomposition as part of hardening.
- Do not change existing canonical hash semantics.
- Do not redesign offline replay retention during hardening.
- Do not reuse UCF-RS code, storage, transaction formats, or hashes in UCF-Yjs.

Exit criteria:

- Foundation A and B are independently reviewable.
- Source-plus-authority workflows recover deterministically after injected
  failure phases.
- Operation and index chains remain valid after recovery.
- The complete UCF-RS test suite passes twice.
- `status --strict` passes on valid fixtures.
- The hardening report states remaining limits.
- A conformance artifact lists behaviors UCF-Yjs must preserve without
  prescribing UCF-RS implementation details.

## 6. Users and primary workflows

### 6.1 Users

- Human editor users who need citation overlays while editing.
- CLI users who need deterministic command outcomes.
- Agents that need bounded state views and legal next actions.
- SDK/API users integrating citation workflows into tools.
- Future MCP clients exposing shared workspace resources.

### 6.2 M0 local MVP reference workflow

This signed-off workflow defines the M0 behavioral baseline that M1 must preserve under recoverable persistence and a real persistent runtime.

1. Create a workspace.
2. Open one text document through two local clients.
3. Activate a citation over an explicit range.
4. Disconnect one client.
5. Apply concurrent edits near or inside the citation.
6. Reconnect and synchronize Yjs updates in different orders.
7. Verify text convergence.
8. Resolve citation anchors to absolute ranges.
9. Classify changed evidence as `changed_unaccepted`.
10. Submit `citation.accept_current`.
11. Create a checkpoint.
12. Export an agent view.
13. Reopen from local persistence and verify the same checkpoint and projection.

## 7. Architecture principles

### 7.1 Protocol first

The command, outcome, projection, checkpoint, and provider contracts must exist
before GUI or external provider integration.

### 7.2 One logical command processor

The M0 local MVP uses one logical command processor per workspace, and M1 preserves that ownership model. It may be embedded in
a CLI, local service, or test harness, but semantic mutation goes through the
same reducer path.

Replicated semantic command processing is deferred until deterministic command
claiming, ordering, and idempotency are specified.

### 7.3 Yjs convergence is structural, not semantic

Yjs tells the system that shared state converged. It does not decide whether a
citation is still valid, whether evidence can be accepted, or whether an actor
had permission to perform a command.

### 7.4 Accepted checkpoints are explicit authority

Live state may change continuously. A checkpoint is a deliberate accepted domain
state with its own digest, command frontier, actor, and policy.

### 7.5 Providers are replaceable

Provider persistence stores and syncs Yjs state. It does not redefine command
semantics, checkpoint semantics, or domain state.

### 7.6 Ambiguity is a valid result

The system must return typed ambiguity and legal next actions rather than
guessing semantic winners.

## 8. Authority planes

UCF-Yjs uses separate authority planes, not one linear hierarchy. Each plane is
authoritative for a different kind of fact.

| Plane | Authoritative for | Not authoritative for |
| --- | --- | --- |
| Collaborative data | Current converged document content, relative anchors, local collaborative metadata | Submitted intent, audit history, semantic acceptance |
| Durable semantic log | Command envelopes, outcome envelopes, actor attribution, idempotency decisions, workspace sequence, outcome chain | Current rendered document content |
| Projection | Citation status, allowed actions, overlays, reports, agent views, reverse indexes | Permanent truth or audit |
| Acceptance | Reviewed domain state at an explicit frontier | Current live workspace state |
| Provider | Durability, synchronization, provider snapshots | Domain meaning, authorization policy, acceptance |
| Awareness | Temporary presence, cursors, connection state | Any persisted authority |

This plane model avoids three mistakes:

- treating provider snapshots as product acceptance;
- treating raw CRDT convergence as semantic validity;
- treating a single `Y.Doc` as an immutable audit database.

## 9. Workspace state model

The MVP must separate collaborative state from durable semantic records.

### 9.1 Collaborative data plane

Yjs stores live collaborative document state and anchor metadata:

```text
Y.Doc workspace
  Y.Map "workspace"
    workspace_id
    schema_version
    created_at
  Y.Map "documents"
    document_id -> Y.Text
  Y.Map "anchors"
    anchor_id -> encoded relative-position metadata
  Y.Map "collaborative_metadata"
    non-authoritative replicated hints
```

The collaborative plane may contain references to commands, outcomes, or
checkpoints for convenience, but those references are projections. They are not
the sole durable authority.

### 9.2 Durable semantic log

The durable semantic log is append-only and stores:

```text
commands.jsonl
outcomes.jsonl
actors.jsonl
idempotency.jsonl
```

Every committed outcome advances a workspace sequence and an outcome-chain hash:

```json
{
  "workspace_sequence": 418,
  "previous_outcome_hash": "sha256:...",
  "outcome_hash": "sha256:..."
}
```

For MVP, one logical command processor owns semantic ordering per workspace.
Distributed semantic processing is out of scope until deterministic claiming,
ordering, and idempotency are specified.

### 9.3 Projection plane

Citation resources, statuses, allowed actions, overlays, reports, reverse
indexes, and agent views are rebuildable projections from:

```text
Yjs collaborative state
+ durable command/outcome log
+ reducer ruleset
+ capability context
```

Reducers must not rely on mutable projection state as permanent truth.

### 9.4 Acceptance plane

Checkpoints are content-addressed accepted manifests in a checkpoint store. They
refer to the live projection and semantic command frontier that were explicitly
accepted. They are not provider snapshots and they do not rewind active Yjs
history.

### 9.5 Partitioning

The MVP may use one small workspace document, but public IDs must allow this
future scalable shape:

```text
Workspace root Y.Doc
  document registry
  shared metadata
  resource references
  workspace configuration

Per-document Y.Doc
  text or rich text
  anchors local to that document

External semantic log
  workspace command/outcome stream

Checkpoint manifest
  references document digests and semantic frontier
```

Large-workspace partitioning is an architecture requirement, not a late
optimization.

## 10. Command contract

Command envelope:

```json
{
  "schema_version": "ucf-yjs.command.v1",
  "command_id": "uuid",
  "idempotency_key": "client-stable-key",
  "actor": {
    "actor_id": "actor_123",
    "kind": "human | agent | service",
    "display": "optional"
  },
  "workspace_id": "ws_123",
  "observed": {
    "checkpoint_id": "cp_42",
    "live_version": "live_sha256..."
  },
  "operation": "document.replace_range",
  "target": {
    "kind": "document",
    "document_id": "doc_123"
  },
  "payload": {}
}
```

Rules:

- Commands are immutable once accepted by the processor.
- Duplicate command IDs or idempotency keys return the original outcome.
- Commands must include actor attribution.
- Commands must include an observed checkpoint or live version when stale-state
  detection matters.
- Invalid commands must not partially mutate live state.

## 11. Outcome contract

Outcome envelope:

```json
{
  "schema_version": "ucf-yjs.outcome.v1",
  "command_id": "uuid",
  "outcome": "committed | rejected | conflict",
  "code": "UCFY_OK",
  "previous_live_version": "live_sha256...",
  "new_live_version": "live_sha256...",
  "affected_resources": [],
  "events": [],
  "allowed_actions": [],
  "diagnostics": []
}
```

Rules:

- Every accepted command must have exactly one outcome.
- Outcomes must be deterministic for the same canonical input.
- Conflicts are successful semantic classifications, not provider failures.
- Diagnostics omit source text by default.

## 11A. Observational reads and audit separation

M1 separates pure observation from semantic mutation.

Pure observations include:

```text
status.get
agent_view.get
```

Rules:

- Observation requests do not append command, idempotency, or outcome records to
  the semantic log.
- Observation requests do not advance `workspace_sequence`, the semantic
  frontier, `live_version`, or checkpoint identity.
- Responses are deterministic projections of the current committed state and
  capability context.
- Optional audit is written to a separate `ucf-yjs.observation_log.v1` plane
  with its own sequence, retention, redaction, and export policy.
- The observation log is not an input to reducers, accepted projections,
  `live_version`, or checkpoint identity.
- An observation request that attempts mutation is rejected before either log is
  written.
- Mutations of workspace content, evidence, acceptance, capabilities,
  checkpoints, schemas, or recovery state remain semantic commands.

Compatibility:

- Historical M0 semantic logs are immutable, including any read outcomes already
  recorded.
- M1 introduces a versioned semantic-frontier profile.
- Migration anchors the prior M0 frontier; it never deletes or reclassifies
  historical records.
- New observations after migration follow the M1 non-semantic rule.

## 12. Live version

The MVP live version must be decided before implementation begins.

Recommended definition:

```text
live_projection_digest = H(
  "ucf-yjs.live_projection.v1",
  canonical_collaborative_domain_projection
)

command_frontier_digest = latest semantic outcome-chain hash for the active frontier profile

live_version = H(
  "ucf-yjs.live.v1",
  workspace_id,
  schema_versions,
  live_projection_digest,
  command_frontier_digest
)
```

Requirements:

- Deterministic across replicas after convergence.
- Independent of provider-specific snapshot IDs.
- Independent of non-authoritative awareness/presence state.
- Stable under JSON key ordering and array ordering rules.
- Cheap enough to compute for MVP-scale workspaces.

For M0, `command_frontier_digest` is the latest outcome-chain hash at the current semantic workspace sequence. M1 adds a versioned frontier profile so pure observations no longer advance that sequence. A DAG or set frontier remains deferred until replicated semantic command processing exists.

## 13. Checkpoints

Checkpoint manifest:

```json
{
  "schema_version": "ucf-yjs.checkpoint.v1",
  "checkpoint_id": "cp_sha256...",
  "workspace_id": "ws_123",
  "created_by": "actor_123",
  "created_at": "...",
  "domain": "citations",
  "domain_schema_version": "ucf-yjs.citations.v1",
  "reducer_version": "ucf-yjs.citations.reducer.v1",
  "parent_checkpoint_id": null,
  "live_version": "live_sha256...",
  "command_frontier": {
    "workspace_sequence": 418,
    "outcome_chain_hash": "sha256:..."
  },
  "document_digests": [],
  "anchor_projection_digest": "sha256:...",
  "accepted_projection_digest": "sha256:...",
  "provider_snapshot_ref": null,
  "policy": {
    "retention": "metadata-only | retain-evidence | retain-documents",
    "visibility": "private | workspace | shared",
    "exportability": "none | metadata | permitted-content",
    "evidence_text_disclosure": "deny | capability-gated | allow",
    "diagnostic_redaction": "required | relaxed",
    "checkpoint_sharing": "private | workspace | explicit-share"
  },
  "verification": {
    "canonical_agent_view_digest": "sha256:..."
  }
}
```

Checkpoint identity requirements:

- Hash an actor-neutral accepted domain projection.
- Include command frontier.
- Include domain schema and reducer version.
- Include document content digests.
- Include anchor projection digest when anchors affect accepted state.
- Include parent checkpoint ID when present.
- Include policy fields that change accepted-state meaning.
- Exclude provider-specific IDs except optional non-identity references.
- Exclude awareness, presence, connection, and display-only state.
- Exclude capability-filtered or caller-specific agent views.
- Exclude creation timestamp from identity unless the profile explicitly makes
  it deterministic.
- Be reproducible after reload from any conforming provider.
- Produce the same `checkpoint_id` for actors with different read capabilities
  when the accepted state is otherwise identical.

`verification.canonical_agent_view_digest` is optional verification metadata. It
must be computed from a documented actor-neutral canonical full projection and
is excluded from `checkpoint_id`. Capability-filtered public agent views may
have their own response digests, but those digests never define checkpoint
identity.

M1 must preserve the approved M0 checkpoint identity. Any M1 field that changes accepted-state meaning must be versioned and included explicitly; operational recovery metadata, observation audit, and provider generation identifiers remain non-identity.

## 14. Agent-view projection

Agents receive bounded canonical JSON:

```json
{
  "schema_version": "ucf-yjs.agent_view.v1",
  "workspace_id": "ws_123",
  "checkpoint_id": "cp_42",
  "live_version": "live_sha256...",
  "documents": [
    {
      "document_id": "doc_123",
      "uri": "src/auth.py",
      "content_hash": "sha256:...",
      "length": 4821
    }
  ],
  "resources": [
    {
      "resource_id": "cit_123",
      "kind": "citation",
      "status": "changed_unaccepted",
      "document_id": "doc_123",
      "range": {"start": 120, "end": 184},
      "accepted_content_hash": "sha256:...",
      "current_content_hash": "sha256:..."
    }
  ],
  "pending_commands": [],
  "conflicts": []
}
```

Requirements:

- deterministic ordering;
- explicit schema version;
- pagination for large state;
- capability-aware omission;
- no opaque anchor bytes unless requested;
- response digest over the exact returned projection;
- capability-filtered response digests are never checkpoint identity;
- an optional canonical full-view verification digest must use a documented
  actor-neutral projection.

## 15. Citation domain MVP

The first domain supports:

- `workspace.create`
- `document.create`
- `document.replace_range`
- `citation.activate`
- `citation.resolve`
- `citation.accept_current`
- `citation.deactivate`
- `checkpoint.create`
- `agent_view.get`

Citation resource:

```json
{
  "resource_id": "cit_...",
  "handle": "AUTH-ROTATE",
  "document_id": "doc_...",
  "anchor_id": "anc_...",
  "accepted_evidence": {
    "content_hash": "sha256:...",
    "byte_count": 64,
    "line_count": 3
  },
  "current_evidence": {
    "content_hash": "sha256:..."
  },
  "status": "valid | changed_unaccepted | missing | ambiguous | inactive",
  "allowed_actions": []
}
```

Rules:

- Citation identity is not the evidence hash.
- Anchor survival is not acceptance.
- Changed current evidence becomes `changed_unaccepted`.
- Exact ambiguity is reported, not guessed.
- Acceptance creates command and outcome records.
- Checkpoint creation is separate from acceptance unless a command explicitly
  requests both.

## 16. Evidence-first compatibility lane

Cite2Site-style evidence identity is not part of the MVP core, but the citation
domain must avoid blocking it.

The MVP should model citations so that future evidence-first expansion can add:

- SourceResource;
- SourceRepresentation;
- EvidenceFragment;
- reverse evidence-to-citation index;
- explicit lineage or successor proposals.

The MVP must not infer EvidenceThread-like lineage from matching text, path
reuse, or anchor survival.

## 17. Provider interface

Provider interface:

```ts
interface UcfYjsProvider {
  connect(workspaceId: string): Promise<ProviderSession>;
  disconnect(): Promise<void>;
  whenSynced(): Promise<void>;
  getStatus(): ProviderStatus;
  loadState(): Promise<Uint8Array | null>;
  saveState(update: Uint8Array): Promise<void>;
  saveProviderSnapshot?(label: string): Promise<string>;
  readProviderSnapshot?(snapshotId: string): Promise<Uint8Array>;
}
```

Required providers:

1. In-memory deterministic test provider.
2. Local persistence provider.

Deferred provider:

3. Velt provider, after local conformance and security boundaries pass.

Provider snapshots are not accepted checkpoints unless a checkpoint explicitly
references them. Provider APIs must not expose an in-place rewind operation for
an active shared workspace.

## 18. Reducer interface

Reducer interface:

```ts
interface DomainReducer<State, Command, Outcome> {
  project(doc: Y.Doc, semanticLog: SemanticLog): State;
  validate(state: State, command: Command, context: CommandContext): ValidationResult;
  apply(doc: Y.Doc, command: Command, context: CommandContext): ApplyResult;
  classify(doc: Y.Doc, affected: ResourceId[], context: CommandContext): DomainEvent[];
}
```

Requirements:

- deterministic for the same canonical input;
- no network access during reduction;
- explicit schema version;
- stable outcome codes;
- capability checks before mutation;
- idempotent commands;
- conformance tests across reordered Yjs updates;
- projection rebuild from Yjs state plus semantic log;
- no writes to projection state as permanent truth.

## 19. Raw Yjs mutation policy

Public clients submit typed commands.

Trusted editor bindings may produce low-level Yjs text transactions only when
all of the following are true:

- actor metadata is attached durably;
- the transaction is wrapped or mirrored as a command record;
- affected resources are classified by the reducer;
- an outcome record is produced;
- unauthorized or malformed editor transactions are rejected before checkpoint.

The preferred M0/M1 path is to route even editor edits through
`document.replace_range`.

## 20. Persistence and recoverability

### 20.1 M0 baseline

M0 persists provider-neutral Yjs state and a processor snapshot containing the
semantic log, citation state, anchors, idempotency records, checkpoints, and
retained checkpoint documents. Restart reproduces the semantic frontier,
checkpoint ID, and projections.

This is a functional local persistence baseline. It is not yet the M1 claim that
every multi-plane write survives interruption as one recoverable workspace
commit.

### 20.2 M1 recoverable workspace generations

M1 must publish the complete local authority as one logical generation:

```text
workspace generation
  collaborative Yjs state
  processor metadata
  validated semantic log
  idempotency state
  citation state and serialized anchors
  checkpoint manifests
  retained checkpoint documents
  schema/version registry references
```

The implementation may use one durable container or an immutable generation
directory, but it must provide the same invariant:

```text
a reader opens the previous valid committed generation
or the next fully validated committed generation
never an unclassified mixture
```

Requirements:

- write new generation material without mutating the active generation;
- record expected and intended digests for every authoritative component;
- flush generation files before publication;
- validate semantic log, checkpoint material, anchors, schemas, and cross-plane
  relationships before publication;
- atomically publish a generation pointer or equivalent commit record;
- sync the publication file and parent directory where supported;
- recover idempotently after failure at every phase;
- preserve the previous committed generation until the next generation is
  validated and published;
- expose machine-readable inspection and resolution for divergence;
- never infer acceptance while repairing persistence;
- never copy UCF-RS transaction layouts or hashes.

Suggested logical phases:

```text
prepared
material_written
validated
published
committed
```

The exact storage representation is implementation-specific and must be
documented before coding.

### 20.3 Recovery outcomes

Recovery must distinguish:

- no recovery required;
- previous committed generation selected;
- prepared generation completed;
- invalid prepared generation discarded safely;
- divergence requiring operator action;
- unsupported schema requiring read-only mode or migration;
- corruption requiring restore from a verified generation or backup.

A process crash, power interruption, or lost response must not cause an
automatic replay of a non-idempotent command. Callers inspect the recovered
frontier and submit a fresh command against fresh preconditions.

## 20A. Offline command semantics

The MVP distinguishes draft document updates from semantic domain commands:

```text
Draft document mutations
  may occur offline and converge through Yjs.

Semantic domain commands
  citation.activate
  citation.accept_current
  citation.deactivate
  checkpoint.create
  require authoritative processor confirmation.

Queued semantic commands
  may be stored locally as pending,
  then become committed, rejected, or conflict after reconnect.
```

Document edits can be optimistic. Citation acceptance and checkpoint creation
cannot be final until an outcome record is durably committed by the command
processor.

## 20B. Forward-only checkpoint restore

Checkpoints do not rewind active CRDT history in place.

Supported actions:

```text
checkpoint.open_readonly
  inspect historical accepted state

checkpoint.fork
  create a new workspace from accepted state

checkpoint.reapply
  generate a new forward command that transforms current live state
```

Provider snapshot restoration is a provider maintenance operation, not domain
acceptance and not active-workspace restore semantics.

## 20C. Schema evolution and registry

M1 introduces an in-repository schema/version registry. The registry is the
single index of supported authority formats and compatibility rules.

It covers at minimum:

```text
command schema
outcome schema
semantic frontier profile
observation log schema
processor snapshot schema
checkpoint manifest schema
provider snapshot schema
workspace generation/transaction schema
citation domain schema
reducer version
canonicalization profile
```

Rules:

- commands and outcomes remain immutable in their original schemas;
- each registry entry declares readers, writers, migrations, compatibility, and
  deprecation state;
- migrations are deterministic pure transformations where possible;
- the first registry revision includes identity/no-op migration tests;
- unsupported newer schemas open read-only or fail with a typed incompatibility
  result rather than being guessed;
- historical reducer verification uses the historical reducer or a documented
  compatible upcast path;
- `live_version` and checkpoint identity include every profile/version that
  changes their canonical meaning;
- M0 semantic-frontier history is preserved when migrating to the M1
  observational-read profile;
- schema migration never silently accepts changed evidence.

Recommended registry artifacts:

```text
schemas/registry.json
docs/schema-registry.md
packages/protocol/src/schema-registry.ts
tests/migrations/
```

## 20D. Local locking and process coordination

M1 defines one exclusive semantic writer per workspace.

POSIX requirements:

- use an operating-system advisory lock held by an open file descriptor;
- process death releases the lock;
- lock metadata is diagnostic only and never proof that a lock is stale.

Windows requirements:

- use an operating-system file or byte-range lock with equivalent exclusivity;
- sharing flags must prevent a second writer from publishing a generation;
- process death releases the lock.

Common rules:

- never delete a lock merely because a timestamp is old;
- expose bounded wait, immediate-fail, and diagnostic owner metadata;
- immutable committed generations may be read without observing prepared state;
- observation-only CLI requests may use a shared/read path when the platform and
  implementation preserve the committed-generation invariant;
- recovery and migration require the exclusive writer lock;
- include same-process, cross-process, crash-release, timeout, and Windows/POSIX
  parity tests.

## 21. Security, privacy, publication, and data handling

M0/M1 threat model:

- trusted local workspace;
- authenticated but trusted clients when networked locally;
- accidental conflicts and buggy clients;
- no Byzantine-update protection.

Capabilities:

```text
workspace.read
workspace.admin
document.read
document.edit
citation.activate
citation.accept
checkpoint.create
checkpoint.open_readonly
checkpoint.fork
checkpoint.reapply
projection.export
evidence_text.read
checkpoint.share
provider.admin
```

Policy dimensions are independent and must not be collapsed into one
`privacy_mode`:

| Dimension | Question |
| --- | --- |
| Retention | Which document, evidence, command, outcome, and checkpoint data is stored, and for how long? |
| Visibility | Which actors or workspace roles may discover or read the resource? |
| Exportability | Which projections may leave the local authority boundary? |
| Evidence disclosure | May accepted or current evidence text be returned, or only hashes and metadata? |
| Diagnostic redaction | Which source, payload, and actor fields are removed from logs and errors? |
| Checkpoint sharing | Can an accepted checkpoint be shared outside its originating workspace? |
| Provider backup | Which provider snapshots or backups may contain source or evidence content? |

M0/M1 data handling requirements:

- Diagnostics omit document and evidence text by default.
- Capability-filtered agent views disclose only permitted fields.
- Export commands require explicit capability and policy evaluation.
- Retention mode is explicit for documents, evidence, semantic logs,
  checkpoints, projections, and provider backups.
- Local provider storage is private operational data.
- Checkpoint manifests record the policy affecting accepted-state portability.
- Public or shared checkpoint references never imply source-text disclosure.
- No encryption-at-rest claim in MVP.
- Remote/provider credentials are never exposed in agent views, logs, or
  exports.
- Velt integration requires actor mapping, tenant/workspace isolation, and
  provider-secret separation.
- MCP is a semantic façade over durable resources; notifications are not an
  audit log and missed notifications are recovered from durable state or event
  cursors.

M0 must define policy defaults for local MVP. M3/M4 remain blocked until
visibility, export, disclosure, redaction, sharing, and provider-backup behavior
have conformance tests.

## 22. Observability

Emit structured events:

```text
workspace.created
workspace.opened
provider.connected
provider.synced
command.received
command.committed
command.rejected
command.conflict
checkpoint.created
checkpoint.opened_readonly
checkpoint.forked
checkpoint.reapplied
anchor.unresolved
domain.review_required
recovery.required
recovery.completed
```

Include:

- workspace ID;
- command ID;
- actor ID;
- correlation ID;
- provider name;
- reducer name;
- stable outcome code;
- elapsed time where useful.

## 23. Repository layout

Target monorepo layout:

```text
ucf-yjs/
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
    sdk/
    cli/
  tests/
    conformance/
    convergence/
    e2e/
    migrations/
    corruption/
    public-api/
  schemas/
    registry.json
  docs/
    TRD.md
    protocol.md
    checkpoint.md
    authority-planes.md
    schema-evolution.md
    provider-contract.md
    domain-contract.md
    security.md
```

Do not create every package before the vertical slice. Start with the packages
needed for protocol, core, command processor, local providers, citation domain,
CLI, and tests.

## 24. Required tests

### 24.1 Protocol

- Duplicate command IDs return identical outcomes.
- Duplicate idempotency keys return identical outcomes.
- Duplicate idempotency key with a different payload returns a stable conflict.
- Invalid commands do not partially mutate.
- Stale observations return typed outcomes.
- Actor and command IDs survive persistence and sync.

### 24.2 Convergence

- Reordered Yjs updates converge.
- Duplicate Yjs updates are harmless.
- Offline edits converge after reconnection.
- Compaction preserves the same agent-view digest.

### 24.3 Anchors

- Concurrent insertion before a range preserves anchor association.
- Boundary insertions follow declared policy.
- Concurrent deletion reports `missing` or `anchor_unresolved`.
- Clients translate anchors identically after sync.

### 24.4 Semantics

- Text convergence does not accept evidence.
- Changed evidence creates `changed_unaccepted`.
- Acceptance creates an outcome record.
- Checkpoint creation creates a checkpoint digest.
- Conflicting lifecycle commands are deterministic.

### 24.5 Providers

- Memory and local providers pass the same conformance suite.
- Provider snapshot restoration does not imply acceptance.
- Provider loss does not redefine domain semantics.

### 24.7 Cross-plane consistency

- Same semantic log plus same Yjs state rebuilds the same domain projection.
- Same projection rebuilds the same agent-view digest.
- Same accepted projection and frontier rebuilds the same checkpoint digest.
- Command committed but projection rebuild interrupted recovers deterministically.
- Yjs update persisted but semantic outcome missing returns a stable recovery
  result.
- Old-schema command replay follows documented upcast behavior.
- Checkpoint fork and reapply are forward operations, not in-place rewinds.

### 24.6 Agent interface

- Agent views are deterministic and bounded.
- Pagination is stable.
- Conflicts expose allowed actions.
- Raw CRDT bytes are unnecessary for normal operation.

### 24.8 M1 recoverable workspace

- Failure at every generation phase returns the previous committed workspace or
  completes the intended generation deterministically.
- No mixed Yjs, semantic-log, citation, or checkpoint generation is published.
- Recovery is idempotent.
- Lost response does not cause automatic duplicate mutation.
- Divergence exposes a typed operator-resolution path.
- Windows and POSIX lock behavior satisfy the same writer-exclusion contract.

### 24.9 Migration and compatibility

- Every registry entry is validated.
- Identity/no-op migration preserves canonical state.
- M0 frontier history migrates without rewriting historical records.
- M1 observations do not advance semantic frontier identity.
- Unsupported newer schemas become typed read-only/incompatible outcomes.
- Historical checkpoints remain reproducible under their registered profiles.

### 24.10 Corruption fixtures

Fixtures include:

- truncated semantic log;
- command without outcome;
- bad idempotency original reference;
- mismatched retained checkpoint document;
- missing or duplicate checkpoint document;
- stale reducer/processor snapshot;
- undecodable anchor;
- malformed workspace generation manifest;
- mismatched component digest;
- unsupported schema version.

Every fixture fails closed with stable diagnostics and no implicit repair of
accepted evidence.

### 24.11 Public API boundaries

- Published package exports are enumerated.
- Consumers cannot import private package source paths.
- Public types contain no provider-specific authority leakage.
- API extraction or equivalent tests detect accidental surface expansion.
- CLI behavior uses only public processor/runtime contracts.

## 25. Milestones

### Foundation A: UCF-RS guardrails and contracts — complete

Merged baseline includes storage schemas, data policy, HTTP-local guardrails,
cross-platform CI, and the behavioral conformance baseline.

### Foundation B: UCF-RS recoverable consistency — complete

Merged baseline includes recoverable source-plus-authority operations,
idempotent recovery, divergence inspection/resolution, failure injection, and
crash/restart testing.

UCF-RS remains an independent oracle. New behavior requires an explicit
versioned oracle review.

### M0: UCF-Yjs local MVP — complete

M0 combines the former architecture-spike and local-MVP phases. It delivered:

- approved authority planes, canonicalization, live version, checkpoint
  identity, schema evolution, privacy, offline, and restore contracts;
- protocol and canonical hashing;
- semantic log and deterministic projections;
- checkpoint store;
- memory and local providers;
- command processor and citation reducer;
- JSONL headless transport;
- convergence, persistence, restart, conformance, and vertical E2E;
- explicit changed-evidence acceptance and actor-neutral checkpoint
  reproduction.

Exit gate: passed and merged.

### M1: Durable local protocol runtime — complete

Delivered in this order:

1. Tag and record immutable UCF-RS and UCF-Yjs M0 baselines.
2. Freeze compatibility policy and schema/version registry.
3. Introduce the M1 semantic-frontier profile and separate observation audit.
4. Build the versioned UCF-RS/UCF-Yjs behavioral conformance corpus.
5. Implement recoverable workspace generations and cross-process locking.
6. Implement reload validation and the corruption fixture suite.
7. Implement the persistent CLI/runtime workspace entrypoint.
8. Add migration tests and public API boundary tests.
9. Run full validation twice and independent review.

Exit gate: passed and merged in PR #2 on 2026-07-31.

- crash recovery never publishes mixed authority;
- migration preserves historical M0 identity and audit;
- reads do not change semantic frontier identity;
- the persistent CLI operates on real named workspaces;
- corruption fails closed;
- behavioral conformance passes independently in UCF-RS and UCF-Yjs;
- no M2/editor or integration scope entered M1;
- the final Ubuntu and Windows validation matrix completed successfully.

Release metadata:

- M0 tag: `0.1.0`;
- M1 merge commit: `7c34a4b5e27336a475fc07c8e2d4b39f222dff3e`;
- M1 proposed tag: `0.2.0-m1` (not yet created).

### M2: Editor/workbench — current

- Open a real M1 workspace.
- Render document text and citation overlays.
- Submit mutations through public typed commands.
- Perform pure reads through the observational projection surface.
- Show acceptance, ambiguity, conflicts, recovery, and checkpoint state.
- Close and reopen without semantic drift.

Exit gate: the editor introduces no second state machine and no private package
dependency.

### M3: Optional Velt provider

- Provider adapter.
- Actor mapping.
- Sync/offline tests.
- Provider snapshot references from checkpoints.
- Secret handling.

Exit gate: Velt passes provider conformance and does not leak into core.

### M4: MCP and multi-agent

- MCP resources and tools over public commands and observations.
- Durable cursors separate from semantic checkpoint identity.
- Multi-agent tests.
- Capability enforcement.

### M5: Evidence-first extension

- Add SourceResource, SourceRepresentation, and EvidenceFragment only if a
  concrete reverse-impact workflow proves value.
- Add derived reverse indexes.
- Add explicit lineage proposals if needed.

Exit gate: no Cite2Site-style expansion without demonstrated workflow value.

## 26. Success metrics

UCF-Yjs succeeds when:

- all clients use one typed protocol;
- CRDT convergence and semantic acceptance are visibly distinct;
- command outcomes are deterministic;
- accepted checkpoints are reproducible;
- agents can act from bounded JSON views;
- local provider and memory provider pass the same conformance suite;
- citation anchors survive ordinary concurrent edits;
- provider replacement does not change domain semantics;
- the citation domain proves the shared-state model;
- future domains can reuse the control plane without duplicating concurrency
  machinery.

## 27. Failure criteria

Stop or redesign when:

- clients must mutate raw Yjs directly to be useful;
- command and outcome records remain solely inside `Y.Doc`;
- live versions cannot be made deterministic;
- checkpoint digests cannot be reproduced after reload;
- checkpoints require in-place CRDT history rewind;
- projections become mutable authority;
- provider state becomes inseparable from authority;
- convergence is mistaken for semantic acceptance;
- attribution is lost during sync;
- conflicts require model guessing;
- Velt APIs leak into core protocol;
- the project becomes more complex than UCF-RS without reusable collaboration
  value;
- evidence-first expansion cannot prove reverse-impact value.

## 28. M1 resolved decisions and release metadata

### Resolved for M1

1. The completed local MVP is M0 and is tagged `0.1.0`.
2. The durable local protocol runtime is M1 and is merged to `main`.
3. The first editor/workbench is M2 and is the active planning milestone.
4. `status.get` and `agent_view.get` are observations and do not advance
   semantic frontier identity.
5. Observation responses use `ucf-yjs.observation_response.v1`, require a
   canonical verified `response_digest`, and cannot be treated as semantic
   outcome-chain records.
6. Optional read audit belongs in a separate observation log and remains outside
   semantic authority.
7. Workspace generations use authenticated phase history, explicit component
   digests, direct-parent lineage, and locked recovery across `prepared`,
   `material_written`, `validated`, `published`, and `committed` phases.
8. Cross-platform writer exclusion uses the documented Python helper around
   POSIX `flock` and Windows `msvcrt.locking`, with typed startup and release
   failures.
9. The schema registry, compatibility vocabulary, persistent CLI layout, typed
   recovery/corruption/locking results, conformance fixture boundary, and public
   export map are implemented and tested.
10. UCF-RS remains an independent versioned behavioral oracle with no runtime,
    storage, canonical-hash, or implementation dependency.

### Release metadata and tag policy

- M0 release tag: `0.1.0`.
- M1 implementation PR: #2, merged on 2026-07-31.
- M1 merge commit: `7c34a4b5e27336a475fc07c8e2d4b39f222dff3e`.
- Final reviewed feature head: `fa7575b35bd274dc8a34ee934540a5dbe277b7fc`.
- Final required GitHub Actions matrix: successful on Ubuntu and Windows with
  Node 22 and Python 3.12.
- Proposed M1 tag: `0.2.0-m1`. It is not yet created; create it from the
  resulting `main` commit after the documentation closeout lands.
- Later milestone releases follow `0.x.0-mN` unless a future release decision
  changes the convention, for example `0.3.0-m2`.

## 28A. M1 completion record

M1 passed its implementation and closeout gates:

- immutable M0 baselines and compatibility references are recorded;
- the schema/version registry and observational-read frontier profile are
  implemented;
- workspace generation, publication, recovery, divergence, and pointer-lag
  invariants are documented and tested;
- Windows and POSIX writer exclusion pass the same validation matrix;
- behavioral conformance compares outcomes rather than storage or hashes;
- corruption fixtures fail closed with typed diagnostics;
- the persistent CLI uses real named workspaces and public runtime contracts;
- public API exports are enumerated and private imports are rejected;
- provider intake remains outside active authority and can be listed, inspected,
  and explicitly discarded without acceptance;
- M2 editor, Velt, MCP, Git/W3C, hosted operation, and package publication did
  not enter the M1 implementation.

Semantic reconciliation of imported provider state remains a future typed
workflow. That deferral does not reopen the completed M1 rule that raw provider
bytes cannot become accepted authority implicitly.

## 29. Final build recommendation

Preserve the signed-off M0 and M1 architecture and proceed to M2 as a separately
authorized editor/workbench milestone.

The required sequence is:

```text
M0 local MVP complete and tagged 0.1.0
→ M1 durable local protocol runtime complete and merged
→ M1 documentation closeout and proposed 0.2.0-m1 tag
→ M2 editor/workbench
→ separately gated adapters and evidence extensions
```

Do not reopen completed architecture without a demonstrated contradiction. M2
must use the public command, observation, projection, checkpoint, and runtime
surfaces and must not introduce a second state machine or private package
dependency. Velt, MCP, Git/W3C, Cite2Site expansion, hosted deployment, and
package publication remain separately gated.

The completed M1 observation rule remains normative: pure observation does not
mutate semantic frontier identity, and the forward-only M0-to-M1 migration does
not rewrite M0 history.
