# M1.7 Review - Reload Validation and Corruption Fixtures

Review target:

- `packages/runtime/src/index.ts`
- `tests/corruption/workspace-corruption.test.ts`
- `docs/decisions/m1-0007-reload-validation-corruption.md`

Findings:

- Fixed before gate close: `validateDurableWorkspace` called
  `openDurableWorkspace`, which can recover and publish pending generations.
  Validation is now non-mutating and checks only the current committed
  generation.

Final findings:

- No findings.

Validation:

- `npm run test:corruption` passed with 15 tests.
- `npm run test:recovery` passed with 5 tests.
- `npm test` passed with 97 tests.
- `git diff --check` passed with line-ending warnings only.

Gate status:

- Complete.
