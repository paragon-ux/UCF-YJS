# M1.5 Recoverable Workspace Generations

Status: accepted

M1 durable local authority is stored as UCF-Yjs workspace generations under a
named workspace store. The representation is not derived from UCF-RS
transaction files.

Each generation contains provider-neutral Yjs state, processor metadata,
citation state, anchors, semantic log, idempotency records, checkpoint
manifests, retained checkpoint documents, and schema/profile references.
`manifest.json` records intended component digests before publication.

Generation phases are:

```text
prepared -> material_written -> validated -> published -> committed
```

Component files are flushed before phase advancement. Publication uses an
atomic `current.json` pointer. The pointer fails closed: malformed,
unsupported, mismatched, or missing-generation pointers are distinct typed
states, and initialization does not overwrite invalid existing authority.

Workspace and generation IDs are mapped to path-safe namespace segments rather
than raw IDs. Workspace IDs must be non-empty NFC strings and cannot be `.`,
`..`, path separators, drive/UNC/device aliases, trailing-dot/space names, or
Windows reserved names. Generation IDs must be canonical `sha256:` lowercase
hex strings. Manifest component paths are fixed relative paths and are checked
for uniqueness and containment.

Inspection and committed-generation open are read-only. `recovery inspect`
classifies pending state without writing manifests or `current.json`;
`recovery resolve` is the locked mutating path. Recovery never appends semantic
command, idempotency, or outcome records and never treats provider state as
accepted evidence. A recoverable candidate must be a direct descendant of the
active committed generation. Missing parents, cycles, sibling pending
generations, stale pending generations, and component divergence return typed
divergence or recovery-required results instead of selecting by generation ID
ordering.

Phase metadata is recovery-critical. `phase` and `phase_history` are checked
for monotonic transitions and bound into a phase-integrity digest that is also
bound into the `current.json` pointer digest. `created_at` is explicitly
non-authoritative and does not affect selection or pointer identity.
