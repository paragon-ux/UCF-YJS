# UCF-Yjs

**A typed command protocol for citations on top of real-time collaborative
documents.**

[Yjs](https://github.com/yjs/yjs) gives you convergent, real-time shared
text. UCF-Yjs sits on top of it and adds the parts Yjs deliberately doesn't
have an opinion on: typed commands with deterministic outcomes, a durable
audit log, explicit acceptance of evidence, and actor-neutral checkpoints —
so "this citation is still valid" is a fact you can trust, not just a range
that happens to still resolve.

This is the local MVP (`0.1.0` tag): provider-backed processor state,
durable semantic authority, deterministic projections, accepted checkpoints,
local persistence, and a headless JSONL command transport.

## Why a command layer on top of a CRDT

Convergence and correctness aren't the same question. Two Yjs replicas can
converge on identical text while a citation attached to that text has
silently gone stale. UCF-Yjs keeps those concerns in separate **authority
planes** so nothing has to guess:

- **Collaborative data** (Yjs) owns current convergent text and anchors —
  nothing else.
- **Durable semantic log** owns typed commands, outcomes, and workspace
  ordering — append-only, hash-chained.
- **Projections** (citation status, allowed actions, agent views) are always
  rebuildable from the log — never mutable authority themselves.
- **Acceptance** (checkpoints) is explicit and actor-neutral — a valid anchor
  and converged text never imply accepted evidence on their own.

Full model in [`docs/authority-planes.md`](docs/authority-planes.md).

## Quickstart

Requires Node.js 22+.

```bash
npm ci
npm run build
npm test
npm run test:conformance
npm run test:convergence
npm run test:e2e
```

UCF-Yjs is not yet published as an npm package — this is a private, local
MVP. The command/outcome protocol is exercised through its test suite and a
headless JSONL transport rather than a standalone CLI binary today.

A minimal command looks like this:

```json
{
  "schema_version": "ucf-yjs.command.v1",
  "command_id": "cmd-cite-1",
  "idempotency_key": "idem-cmd-cite-1",
  "actor": { "actor_id": "actor-1", "kind": "agent" },
  "workspace_id": "ws-1",
  "operation": "citation.activate",
  "target": { "kind": "document", "document_id": "doc-1" },
  "payload": { "citation_id": "c1", "start": 0, "end": 5, "expected_text": "Alpha" }
}
```

Submitted through the processor (or piped as JSONL through the CLI package),
it returns a typed outcome envelope with a stable `code` — `UCFY_OK`,
`UCFY_CONFLICT_CHANGED_EVIDENCE`, and so on — never a silent success or
failure. See the [Protocol doc](docs/protocol.md) for the full envelope
shapes.

## Who this is for

- **Humans** embedding UCF-Yjs in a collaborative app, or evaluating it →
  read the [User Guide](docs/user-guide.md).
- **AI agents** issuing commands against a workspace as a client (the
  protocol has first-class support for `"kind": "agent"` actors and
  capability-filtered agent views) → read the [Agent Guide](docs/agent-guide.md).

## What's implemented

- Typed command and outcome envelopes: schema validation, canonical JSON,
  idempotency handling, domain-framed SHA-256 digests.
- One logical workspace processor per workspace, staging reducer/Yjs/
  checkpoint mutations and publishing only after the semantic log append
  succeeds.
- A durable semantic log: monotonic workspace sequence, outcome-chain
  frontier, duplicate-command handling, idempotency conflict outcomes.
- Provider-neutral Yjs state (in-memory and local providers), including
  persisted provider bytes and opaque processor authority snapshots.
- Citation operations: workspace creation, document creation, range
  replacement, citation activate/resolve/accept/deactivate, checkpoint
  creation, status, and agent views.
- Checkpoint manifests with actor-neutral identity, accepted projection
  digests, retained document digest verification, and forward-only restore.
- Deterministic projections: workspace status, documents, citations,
  conflicts, allowed actions, live version, accepted projection, anchors,
  and capability-filtered agent views.
- Headless JSONL transport that returns per-line outcomes and preserves
  committed results even when a later input line is malformed.

## Integrity boundaries

- Raw Yjs updates are provider material, not the public command contract —
  agents are not required to read or submit raw CRDT bytes for normal
  citation workflows.
- `new_live_version` is post-command state; it is not part of the
  hash-authoritative outcome body.
- Checkpoints reclassify active citations against converged Yjs state and
  block changed or unresolved evidence until explicit acceptance or
  resolution.
- Missing, unresolved, ambiguous, or inactive citations can never be
  accepted as valid current evidence.
- Capability filtering changes response shape, never checkpoint identity.

## Status and scope

Local MVP, trusted-client only. **Not included in this MVP:** a GUI, a
published npm package or standalone CLI binary, Velt integration, an MCP
facade, Git workflow integration, W3C annotation export, hostile-client
validation, or an encryption-at-rest claim. See
[`docs/security.md`](docs/security.md) for the exact threat model.

UCF-Yjs is a separate project from **UCF-RS**, which implements the same
citation model for plain source files without a collaborative-editing layer.
UCF-Yjs may translate UCF-RS's documented conformance behavior into tests,
but does not import UCF-RS storage formats, hashes, or implementation
internals.

## Documentation

- [User Guide](docs/user-guide.md) — for people embedding UCF-Yjs
- [Agent Guide](docs/agent-guide.md) — for AI agents issuing commands
- [Technical requirements](docs/TRD.md)
- [Authority planes](docs/authority-planes.md)
- [Protocol](docs/protocol.md)
- [Canonicalization](docs/canonicalization.md)
- [Checkpoints](docs/checkpoint.md)
- [Provider contract](docs/provider-contract.md)
- [Offline semantics](docs/offline-semantics.md)
- [Security model](docs/security.md)
- [Implementation log](docs/implementation-log.md)

## Validation

```bash
npm run build
npm test
npm run test:conformance
npm run test:convergence
npm run test:e2e
git diff --check
```
