# M1.9 Review - Public API Boundary

Review target:

- `package.json`
- `api-surface/m1-public-api.json`
- `tests/public-api/public-api.test.ts`
- `docs/decisions/m1-0009-public-api-boundary.md`

Findings:

- Fixed before gate close: the initial public API snapshot missed existing
  protocol runtime exports `commandRecordHash` and `outcomeRecordHash`.
- Fixed before gate close: the snapshot listed `GENESIS_OUTCOME_HASH` as a
  semantic-log runtime export even though it is not emitted as a JavaScript
  value.

Final findings:

- No findings.

Validation:

- `npm run test:public-api` passed with 5 tests.
- `npm test` passed with 103 tests.
- `git diff --check` passed with line-ending warnings only.

Gate status:

- Complete.
