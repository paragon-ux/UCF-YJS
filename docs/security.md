# Security And Data Policy

MVP threat model: trusted local workspace with authenticated but trusted
clients when networked locally. The MVP handles accidental conflicts and buggy
clients. It does not defend against Byzantine CRDT updates or hostile clients.

## Capability Model

Initial capabilities:

- `workspace.read`
- `workspace.admin`
- `document.read`
- `document.edit`
- `citation.activate`
- `citation.accept`
- `citation.deactivate`
- `checkpoint.create`
- `checkpoint.open_readonly`
- `checkpoint.fork`
- `checkpoint.reapply`
- `projection.export`
- `evidence_text.read`
- `checkpoint.share`
- `provider.admin`

Capability checks occur before mutation. Permission failures return
`UCFY_REJECTED_PERMISSION`.

## Local MVP Policy Defaults

| Dimension | Default |
| --- | --- |
| Retention | Retain semantic command/outcome metadata, provider state, and checkpoint manifests locally until explicit deletion. |
| Visibility | Private to the local workspace by default. |
| Exportability | Metadata and hashes exportable; source/evidence text requires capability and policy. |
| Evidence disclosure | Deny evidence text in diagnostics and default agent views. |
| Diagnostic redaction | Required; diagnostics omit document/evidence text by default. |
| Checkpoint sharing | Private unless explicitly shared by policy. |
| Provider backup | Local private operational data; provider snapshots are not accepted checkpoints. |

## Data Handling Rules

- Agent views are capability-filtered and deterministic.
- Default diagnostics may include IDs, hashes, stable codes, and ranges, but not
  source text or evidence text.
- Local provider storage may contain document content and Yjs updates.
- Checkpoint manifests may disclose metadata and hashes without disclosing text.
- Public or shared checkpoint references do not imply source text disclosure.
- No encryption-at-rest guarantee is made for MVP.
- Remote credentials and provider secrets must never appear in agent views,
  semantic logs, diagnostics, or exports.

## Transport Choice

M0 selects stdio JSONL as the non-JavaScript transport for MVP. It keeps the
transport local, deterministic, and easy to test without adding HTTP security
scope.

Loopback HTTP remains deferred. If added later, it must be loopback-only by
default, enforce a maximum request size, document no authentication or TLS, and
require explicit unsafe remote opt-in.
