# UCF-Yjs 0.2.0-m1 — Durable Local Protocol Runtime

UCF-Yjs `0.2.0-m1` completes the M1 durable local protocol runtime milestone.

This release turns the M0 local MVP into a recoverable, persistent named-workspace runtime while preserving the signed-off authority model: Yjs owns convergent collaborative state, the semantic log owns typed intent and outcomes, projections remain rebuildable, and checkpoints remain explicit actor-neutral acceptance.

## Highlights

### Recoverable workspace generations

M1 adds immutable, multi-plane workspace generations with explicit lifecycle phases:

```text
prepared
material_written
validated
published
committed
```

Generation publication validates collaborative state, semantic authority, checkpoint material, schema references, and cross-plane relationships before activation. Recovery is idempotent and does not infer semantic acceptance.

The runtime also recovers valid manifest-before-pointer crash windows at the `published` and `committed` stages while rejecting stale, divergent, or ambiguous recovery candidates.

### Cross-platform workspace locking

Each workspace now has one exclusive OS-backed semantic writer lock:

- POSIX systems use `flock`.
- Windows uses `msvcrt.locking`.
- Lock acquisition supports immediate failure and bounded waiting.
- Process exit releases the lock.
- Recovery, migration, provider intake resolution, publication, and semantic mutation are serialized.

Node.js 22+ and Python 3 are required for the durable lock helper. Set `UCF_YJS_LOCK_PYTHON` when the Python executable is not available through the platform default.

### Observations no longer change semantic identity

Valid `status.get` and `agent_view.get` requests now use the versioned `ucf-yjs.observation_response.v1` envelope.

Pure observations:

- do not append semantic command, idempotency, or outcome records;
- do not advance `workspace_sequence`;
- do not change the semantic frontier, `live_version`, or checkpoint identity;
- require a canonical, verified `response_digest`;
- cannot contain or validate as a semantic `outcome_hash` record.

Historical M0 read outcomes remain immutable and replayable through existing command and idempotency authority.

### Persistent named-workspace CLI and runtime

M1 adds persistent workspace operations for:

- workspace initialization and validation;
- typed command submission;
- status and agent-view observations;
- checkpoint operations;
- recovery inspection and resolution;
- provider-neutral state export and import;
- provider intake listing, inspection, and discard.

Read-only operations do not publish generations. Mutating and recovery operations acquire the workspace writer lock.

### Provider intake controls

Non-identical raw provider state is no longer treated as active or accepted authority.

Instead, it is retained as unclassified provider intake that can be:

- listed through typed runtime and CLI APIs;
- inspected without exposing document text;
- explicitly discarded under the writer lock;
- resolved idempotently with operator attribution.

Discarding provider intake never applies or accepts it. Semantic reconciliation remains a future typed workflow.

### Schema registry and compatibility policy

This release adds the M1 schema and version registry covering:

- commands and outcomes;
- semantic frontier profiles;
- observation logs and responses;
- processor and provider snapshots;
- checkpoint manifests;
- workspace generations;
- citation schemas and reducer versions;
- canonicalization profiles.

Historical generations retain the exact schema and profile references they used. Compatible registry growth does not invalidate otherwise valid historical authority.

### M0-to-M1 migration

`migrateM0LocalWorkspace()` provides a locked, forward-only migration path for M0 local-provider workspaces.

Migration:

- retains the exact source bytes;
- records actor and source-digest metadata;
- preserves historical command, outcome, idempotency, and checkpoint identity;
- anchors the historical M0 semantic frontier;
- transitions future observations to the M1 frontier profile without rewriting M0 history.

### Behavioral conformance and fail-closed validation

The release adds the versioned UCF-RS/UCF-Yjs behavioral conformance corpus and independent adapters for both implementations.

Coverage includes:

- activation and evidence edits;
- changed, missing, and ambiguous evidence;
- explicit acceptance;
- stale observation and idempotency behavior;
- checkpoint gating;
- offline replay;
- recovery-required and divergence outcomes.

Corruption fixtures cover malformed manifests, digest mismatches, truncated logs, missing outcomes, invalid idempotency references, checkpoint material errors, stale snapshots, undecodable anchors, unsupported schemas, and provider drift. Invalid authority fails closed with typed diagnostics.

### Public API boundary

Package exports now define the supported public subpaths. Tests reject private source-path imports and snapshot the M1 public surface in `api-surface/m1-public-api.json`.

## Compatibility notes

- M0 semantic records and checkpoint identifiers remain valid.
- Pure reads now use non-semantic observation responses.
- Raw provider imports may require explicit intake resolution before acceptance-sensitive operations can continue.
- The project remains local and trusted-client only.
- This release is not an npm publication.

## Requirements

- Node.js 22 or newer
- Python 3 for the workspace lock helper
- Supported validation platforms: GitHub-hosted Ubuntu and Windows runners

## Validation

The M1 validation matrix includes:

```bash
npm run build
npm test
npm run test:conformance
npm run test:conformance-oracle
npm run test:convergence
npm run test:e2e
npm run test:migrations
npm run test:corruption
npm run test:recovery
npm run test:locking
npm run test:public-api
git diff --check
```

## Not included

M1 does not include:

- an editor or workbench;
- npm publication;
- Velt integration;
- an MCP façade;
- Git or W3C integration;
- hosted operation;
- hostile-client validation;
- an encryption-at-rest claim.

These remain gated to M2 and later milestones.

## Next milestone

M2 introduces the first editor/workbench over the M1 runtime. It must use public typed commands and observational reads, display acceptance and recovery state, and avoid introducing a second state machine or private package dependency.
