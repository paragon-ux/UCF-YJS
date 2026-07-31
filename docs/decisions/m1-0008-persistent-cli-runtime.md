# M1.8 Persistent CLI Runtime

Status: accepted

M1 adds a named-workspace runtime path used by the CLI. The runtime flow is:

```text
open workspace -> acquire writer lock for mutations/recovery -> validate or
recover -> execute command or observation -> publish generation only when the
semantic log changes -> release lock
```

The original JSONL stdin transport remains available when no CLI subcommand is
provided. Named-workspace CLI commands use public runtime functions for
workspace init/validate, command submission, status, agent view, recovery
inspect/resolve, checkpoint list/verify/open-readonly/fork/reapply, and
provider-neutral export/import.

Valid `status` and `agent-view` observations do not create a generation merely
because state was read.
