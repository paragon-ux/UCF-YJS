# Technical Requirements Document: UCF-Yjs Protocol-First Long-Term Project

**Document status:** Proposed  
**Product:** UCF-Yjs  
**Decision:** UCF-Yjs is the single long-term architecture to build  
**Architecture:** Protocol-first, provider-neutral shared-state control plane over Yjs  
**Initial provider:** In-memory and local persistence providers  
**Deferred provider:** Velt, only after local conformance passes  
**Reference domain:** Source-clean citation lifecycle  
**Required baseline:** Independently hardened UCF-RS behavior and conformance; no runtime or storage dependency  
**Non-selected peer architecture:** Cite2Site v2 remains a domain-design input, not a separate build in this plan

## 1. Executive summary

UCF-Yjs is the selected long-term project because it has the broadest strategic
value: one shared state and one typed command protocol for humans, agents, CLIs,
SDKs, APIs, MCP clients, and graphical clients.

The project must start protocol-first. Yjs provides convergent shared data, but
it does not provide semantic acceptance, durable audit attribution, capability
checks, deterministic agent views, or product-domain reducers. UCF-Yjs supplies
those layers.

The first release must not start with a GUI, Velt integration, or broad domain
SDK. It must first harden UCF-RS as an independent citation-behavior
baseline and conformance oracle, then prove a narrow UCF-Yjs vertical slice:

```text
create workspace
open text document through two clients
activate citation over a selection
apply concurrent edits
verify Yjs convergence
classify citation as changed_unaccepted
accept current evidence
create accepted checkpoint
return identical typed outcomes and agent views
```

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

- Harden UCF-RS as an independent behavioral baseline and conformance oracle
  before UCF-Yjs MVP implementation.
- Provide one canonical shared live state for all actors.
- Provide one typed command and outcome protocol.
- Keep raw Yjs updates out of the public agent contract.
- Use Yjs for convergence and relative anchoring.
- Use domain reducers for semantic validation and classification.
- Preserve source-clean citation behavior.
- Distinguish live state from accepted checkpoints.
- Preserve durable actor, command, and outcome attribution.
- Produce deterministic bounded JSON projections for agents.
- Support local-first operation and provider-neutral persistence.
- Keep Velt replaceable.
- Provide conformance tests that every provider and client must pass.
- Establish a path for future domains without making the MVP generic too early.

## 5. Non-goals

- Replacing UCF-RS with UCF-Yjs before the local baseline is hardened.
- Building Cite2Site v2 as a separate product in this plan.
- Building a GUI-first product.
- Starting with Velt or any hosted provider as canonical authority.
- Exposing raw Yjs binary updates as the normal API for agents.
- Treating CRDT convergence as semantic acceptance.
- Inferring lineage from text equality, locator proximity, or path reuse.
- Supporting malicious Byzantine clients in the MVP.
- Providing universal semantic merge.
- Building W3C Web Annotation compatibility in the MVP.
- Building Git-native authority in the MVP.
- Supporting arbitrary domain plugins before the citation domain is proven.
- Depending on UCF-RS source code, Python runtime, JSONL storage layouts,
  transaction format, or canonical hashes.

## Required UCF-RS Conformance Baseline

UCF-RS hardening is part of this program, but it remains an independent
implementation. Its purpose is to establish a reliable comparison baseline for
source-clean citation behavior and recoverable local operation.

The work is split into two reviewable changes.

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

### 6.2 MVP workflow

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

The MVP uses one logical command processor per workspace. It may be embedded in
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

## 12. Live version

The MVP live version must be decided before implementation begins.

Recommended definition:

```text
live_projection_digest = H(
  "ucf-yjs.live_projection.v1",
  canonical_collaborative_domain_projection
)

command_frontier_digest = latest outcome_chain_hash for the workspace sequence

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

For the single-processor MVP, `command_frontier_digest` is the latest
outcome-chain hash at the current workspace sequence. A DAG or set frontier is
deferred until replicated semantic command processing exists.

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

No M1 implementation begins until checkpoint identity bytes and non-identity
verification fields are approved.

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

The preferred MVP path is to route even editor edits through
`document.replace_range`.

## 20. Persistence and recoverability

MVP persistence requirements:

- Persist Yjs state or updates through the local provider.
- Preserve command and outcome records in the durable semantic log.
- Rebuild idempotency indexes after restart.
- Detect commands without outcomes.
- Resolve incomplete commands deterministically or return
  `UCFY_RECOVERY_REQUIRED`.
- Exclude awareness/presence from authority.
- Provide provider-neutral export/import.

The project should adopt UCF-RS's recoverable-consistency lesson: do not claim
impossible multi-file atomicity. Instead, define transaction phases, idempotent
recovery, and stable diagnostics.

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

## 20C. Schema evolution

M0 must define schema evolution before public identifiers are frozen:

- commands are immutable in their original schema;
- reducers declare supported input versions;
- older commands are upcast through deterministic pure transformations;
- checkpoints include domain schema and reducer version;
- checkpoint verification can run against the historical reducer ruleset or a
  documented compatible upcast path;
- agent projections negotiate supported schema versions;
- incompatible clients become read-only rather than silently rewriting data.

## 21. Security, privacy, publication, and data handling

MVP threat model:

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

Data handling requirements:

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

## 25. Milestones

### M-1A: UCF-RS guardrails and contracts

- Add storage schema documentation.
- Add UCF-RS data-handling policy.
- Harden local HTTP boundaries.
- Expand CI across Python versions and Windows.
- Record the UCF-RS behavioral conformance baseline.

Exit gate: Foundation A passes twice and is independently reviewed.

### M-1B: UCF-RS recoverable consistency

- Implement recoverable crash consistency for source-plus-authority workflows.
- Add idempotent transaction recovery.
- Add phase fault injection and subprocess crash/restart E2E.
- Produce a hardening report that states remaining limits.

Exit gate: UCF-RS validation passes and no Yjs, Velt, Git, W3C, editor binding,
broad decomposition, or UCF-Yjs dependency scope has entered UCF-RS.

### M0: Architecture decisions and bounded spikes

- Approve authority plane model.
- Choose live-version digest.
- Choose actor-neutral checkpoint digest.
- Define canonical serialization.
- Define semantic log ordering and workspace sequence.
- Define command/outcome schemas.
- Define offline draft edit versus semantic command behavior.
- Define forward-only checkpoint restore semantics.
- Define schema evolution and mixed-client behavior.
- Define privacy/publication policy dimensions and local defaults.
- Prove Yjs update convergence.
- Prove RelativePosition behavior for citation ranges.
- Prove deterministic actor-neutral accepted-projection digest.
- Prove capability-filtered agent views do not alter checkpoint identity.
- Decide raw editor mutation policy.
- Confirm UCF-Yjs has no runtime, code, storage, transaction, or hash dependency
  on UCF-RS.

Exit gate: no M1 scaffold, GUI, Velt, or provider implementation before M0
decisions are reviewed and explicitly approved.

### M1: Protocol and local MVP

- Implement protocol package.
- Implement durable semantic log package.
- Implement projection rebuild package.
- Implement checkpoint store package.
- Implement in-memory provider.
- Implement local provider.
- Implement command processor.
- Implement citation reducer.
- Implement CLI/headless client.
- Implement conformance suite.

Exit gate: vertical slice passes without GUI or Velt.

### M2: Workbench

- Minimal editor workbench.
- Citation overlays.
- Acceptance UI.
- Conflict/outcome panel.
- Agent-view inspector.

Exit gate: workbench uses the same command protocol as CLI.

### M3: Optional Velt provider

- Provider adapter.
- Actor mapping.
- Sync/offline tests.
- Provider snapshot references from checkpoints.
- Secret handling.

Exit gate: Velt passes provider conformance and does not leak into core.

### M4: MCP and multi-agent

- MCP resources and tools.
- Subscription/event interface.
- Multi-agent tests.
- Capability enforcement.

### M5: Evidence-first extension

- Add SourceResource, SourceRepresentation, and EvidenceFragment only if a
  concrete reverse-impact workflow proves value.
- Add derived reverse indexes.
- Add explicit lineage proposals if needed.

Exit gate: no Cite2Site-style graph expansion without demonstrated workflow
value.

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

## 28. Open questions

These must be answered before M1 implementation:

1. What exact canonical bytes define `live_version`?
2. What exact canonical bytes define actor-neutral `checkpoint_id`, and
   which verification metadata is explicitly excluded?
3. Are command and outcome records retained forever?
4. What is the command frontier representation?
5. Can trusted editor transactions bypass `document.replace_range` in MVP?
6. What exact canonical serialization rules define hashes and digests?
7. How are large documents chunked or subdocumented?
8. What is the non-JavaScript command transport: stdio, HTTP, or both?
9. What are the default retention, visibility, exportability, evidence
   disclosure, diagnostic-redaction, checkpoint-sharing, and provider-backup
   policies for local MVP?
10. Which actor and capability model is sufficient for local MVP?
11. How are old command schemas upcast or rejected?
12. What exact workflow justifies evidence-first expansion after M4?
13. Which UCF-RS source-plus-authority commands must use transaction recovery
    before UCF-Yjs implementation begins?

## 28A. Implementation-readiness gate

Foundation and M0 are implementation-ready when all of the following are true:

- UCF-RS Foundation A and B are separate review units.
- UCF-RS remains an independent implementation and conformance oracle.
- The starter Codex task authorizes no M1 scaffold.
- Authority planes have one owner for each kind of fact.
- Durable commands and outcomes are outside sole `Y.Doc` authority.
- Live-version canonical bytes are documented.
- Checkpoint identity is actor-neutral and capability-independent.
- Capability-filtered agent views are excluded from checkpoint identity.
- Privacy, publication, disclosure, redaction, sharing, and backup defaults are
  documented.
- Offline draft edits and queued semantic commands have distinct state
  transitions.
- Checkpoint restore is forward-only.
- Raw editor mutation policy is approved.
- Schema evolution and mixed-client behavior are approved.
- A human review explicitly authorizes M1.

Failure of any gate produces an M1 `not ready` outcome rather than implicit
permission to scaffold packages.

## 29. Final build recommendation

Build UCF-Yjs as one long-term project, but only through a protocol-first,
local-provider-first sequence after UCF-RS is independently hardened as a
behavioral baseline and conformance oracle.

Do not build the earlier three-track plan as three peers. Harden UCF-RS first,
preserve Cite2Site v2 as evidence-model input, and then invest implementation
effort into UCF-Yjs.
