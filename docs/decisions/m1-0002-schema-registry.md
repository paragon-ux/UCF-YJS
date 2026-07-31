# M1-0002 Schema Registry

## Decision

Create the first UCF-Yjs schema registry as `schemas/registry.json`, mirror it
through `packages/protocol/src/schema-registry.ts`, and validate it with
migration tests.

## Alternatives

- Keep schema versions as scattered constants only.
- Wait until workspace generations exist before adding a registry.
- Register the planned citation reducer name instead of the current
  implementation reducer value.

## Reason

M1 migrations, observations, recovery, and persistent runtime work need one
deterministic compatibility index before behavior changes. The registry must
name current M0-readable artifacts as they exist today. Planned or reserved M1
surfaces are marked read-only and non-writable until their features implement
them. The workspace-generation entry was reserved at M1.2 and is now
writable/readable because recoverable workspace generations are implemented in
M1.5.

## Canonical Or Compatibility Effect

The registry records current identity-compatible M0 formats. It does not change
command or outcome hashes, checkpoint identity, semantic frontier bytes,
provider bytes, or reducer behavior.

## Migration Effect

M1.2 implemented identity/no-op migrations. M1.3 added the M0 semantic
frontier anchor migration for the M1 observational-read profile. Unsupported
versions return typed incompatibility instead of being guessed.

## Future Extension Point

Future schema additions must be compatibility entries, not a requirement that
historical workspace generations contain the current full registry. Generations
store the exact schema/profile references they used and are checked against the
current compatibility policy on read.
