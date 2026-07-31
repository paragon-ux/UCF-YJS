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
atomic `current.json` pointer. Recovery never appends semantic command,
idempotency, or outcome records and never treats provider state as accepted
evidence. If a complete intended generation is present after a crash, recovery
publishes and commits it. If only a prepared generation exists, the previous
committed generation remains active. If component bytes diverge from the
manifest digest, recovery returns a typed divergence result.
