# M1.5 Review - Recoverable Workspace Generations

Review target:

- `packages/runtime/src/index.ts`
- `tests/recovery/workspace-generation.test.ts`
- `schemas/registry.json`
- `packages/protocol/src/schema-registry.ts`
- `docs/decisions/m1-0005-recoverable-workspace-generations.md`

Findings:

- Fixed before gate close: pointer `manifest_digest` covered mutable phase
  fields and would not match the final committed manifest after phase
  advancement. The runtime now hashes only generation identity/material fields
  and verifies the pointer on open/recovery.
- Fixed before gate close: recovery selected pending generations by hash
  lexical order. It now prefers the most advanced phase before using
  generation ID as a deterministic tie-breaker.
- Fixed before gate close: validation checked component digests but did not
  cross-check split component files against the processor snapshot. The
  validator now compares citation, anchor, semantic log, idempotency,
  checkpoint, retained-document, and schema/profile components to the snapshot.

Final findings:

- No findings.

Validation:

- `npm run test:recovery` passed with 5 tests.
- `npm run test:migrations` passed with 7 tests.
- `npm test` passed with 78 tests.
- `git diff --check` passed with line-ending warnings only.

Gate status:

- Complete.
