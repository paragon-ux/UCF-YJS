# UCF-YJS

UCF-YJS is the local MVP for a protocol-first collaborative citation runtime on
top of Yjs. The `0.1.0` Git tag marks the approved local MVP: provider-backed
processor state, durable semantic authority, deterministic projections,
accepted checkpoints, local persistence, and headless JSONL command transport.

This repository is intentionally separate from UCF-RS. UCF-RS remains the local
source-clean citation authority reference; UCF-YJS may reproduce required
behavior through documented conformance rules, but it does not import UCF-RS
storage formats, hashes, or implementation internals.

## Quickstart

```bash
npm ci
npm run build
npm test
npm run test:conformance
npm run test:convergence
npm run test:e2e
```

Node.js 22 or newer is required. The project is private and is not published as
an npm package in this MVP.

## What Is Implemented

- Typed command and outcome envelopes with schema validation, canonical JSON,
  idempotency handling, and domain-framed SHA-256 digests.
- A single logical workspace processor that stages reducer/Yjs/checkpoint
  mutations and publishes them only after semantic-log append succeeds.
- Durable semantic-log records with monotonic workspace sequence, outcome-chain
  frontier, duplicate command handling, and idempotency conflict outcomes.
- Provider-neutral Yjs state through in-memory and local providers, including
  persisted provider bytes plus opaque processor authority snapshots.
- Citation reducer operations for workspace creation, document creation,
  range replacement, citation activation/resolution/acceptance/deactivation,
  checkpoint creation, status, and agent views.
- Checkpoint manifests with actor-neutral identity, accepted projection digests,
  retained document digest verification, and forward-only restore operations.
- Deterministic projections for workspace status, documents, citations,
  conflicts, allowed actions, live version, accepted projection, anchors, and
  capability-filtered agent views.
- Headless JSONL CLI transport that returns per-line outcomes and preserves
  committed results when later input lines are malformed.

## Integrity Boundaries

- Raw Yjs updates are provider material, not public command payloads.
- `new_live_version` is post-command state and is not part of the
  hash-authoritative outcome body.
- Checkpoints reclassify active citations against converged Yjs state and block
  changed or unresolved evidence until explicit acceptance or resolution.
- Missing, unresolved, ambiguous, or inactive citations cannot be accepted as
  valid current evidence.
- Capability filtering changes response shape, not checkpoint identity.

## Documentation

- [Technical requirements](docs/TRD.md)
- [Authority planes](docs/authority-planes.md)
- [Protocol](docs/protocol.md)
- [Canonicalization](docs/canonicalization.md)
- [Checkpoints](docs/checkpoint.md)
- [Provider contract](docs/provider-contract.md)
- [Offline semantics](docs/offline-semantics.md)
- [Security model](docs/security.md)
- [Implementation log](docs/implementation-log.md)

## Scope

The MVP is local and trusted-client only. It does not include a GUI, Velt
integration, MCP facade, Git workflow integration, W3C annotation export,
hostile-client validation, or encryption-at-rest claim.

## Validation

```bash
npm run build
npm test
npm run test:conformance
npm run test:convergence
npm run test:e2e
git diff --check
```
