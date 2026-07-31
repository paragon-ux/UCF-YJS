# M1.8 Review - Persistent CLI Runtime

Review target:

- `packages/runtime/src/index.ts`
- `packages/cli/src/index.ts`
- `tests/e2e/persistent-cli-runtime.test.ts`
- `docs/decisions/m1-0008-persistent-cli-runtime.md`

Findings:

- Fixed before gate close: CLI `main()` read stdin for all runtime
  subcommands, so commands that do not need a request body could block in an
  interactive terminal. Stdin is now read only for `command submit`.

Final findings:

- No findings.

Validation:

- `npm run test:e2e` passed with 3 tests.
- `npm test` passed with 98 tests.
- `git diff --check` passed with line-ending warnings only.

Gate status:

- Complete.
