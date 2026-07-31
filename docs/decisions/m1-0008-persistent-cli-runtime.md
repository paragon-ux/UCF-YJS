# M1.8 Persistent CLI Runtime

Status: accepted

M1 adds a named-workspace runtime path used by the CLI. The runtime flow is:

```text
open workspace -> acquire writer lock for mutations/recovery -> validate or
classify recovery -> execute command or observation -> publish generation only
when the semantic log changes -> release lock
```

The original JSONL stdin transport remains available when no CLI subcommand is
provided. Named-workspace CLI commands use public runtime functions for
workspace init/validate, command submission, status, agent view, recovery
inspect/resolve, checkpoint list/verify/open-readonly/fork/reapply, and
provider-neutral export/import.

Valid `status` and `agent-view` observations do not create a generation merely
because state was read. Historical M0 semantic read records are checked for
command/idempotency replay before the M1 non-semantic observation response path
is used.

`recovery inspect`, `status`, `agent-view`, checkpoint reads, and provider
export are read-only. `recovery resolve`, workspace initialization, command
submission that changes the semantic log, and generation publication acquire
the writer lock before mutating authority.

Provider export emits provider-neutral Yjs bytes from the currently committed
workspace. Raw provider import is not semantic authority. Empty fresh imports
are a no-op, identical imports into an existing workspace are classified as
already represented, and changed/fresh raw provider bytes are retained as
unclassified intake that requires a future explicit reconciliation path before
it can become checkpointable accepted state.

The lock helper defaults to `python3` on POSIX and `python` on Windows, and can
be configured through runtime lock options or `UCF_YJS_LOCK_PYTHON`. Startup,
busy, invalid-ready, missing-interpreter, timeout, early-exit, and release
failures return typed lock results.
