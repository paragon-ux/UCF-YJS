# M1.6 Review - Windows and POSIX Locking

Review target:

- `packages/runtime/src/index.ts`
- `tests/locking/workspace-lock.test.ts`
- `docs/decisions/m1-0006-workspace-locking.md`

Findings:

- Fixed before gate close: the read-while-locked test used a processor-created
  Yjs document but did not pass that document to the generation writer, so a
  failing assertion could leave the helper process alive. The helper now
  returns the explicit `Y.Doc`, and the lock release is wrapped in `finally`.

Final findings:

- No findings.

Validation:

- `npm run test:locking` passed with 4 tests.
- `npm test` passed with 82 tests.
- `git diff --check` passed with line-ending warnings only.

Gate status:

- Complete.
