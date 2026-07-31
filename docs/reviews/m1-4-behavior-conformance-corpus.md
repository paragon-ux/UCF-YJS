# M1.4 Review - Behavioral Conformance Corpus

Review target:

- `tests/conformance/behavior-fixtures.json`
- `tests/conformance/behavior-corpus.test.ts`
- `docs/decisions/m1-0004-behavior-conformance-corpus.md`

Findings:

- No findings.

Validation:

- `npm run test:conformance-oracle` passed with 3 tests.
- `npm run test:conformance` passed with 21 tests.
- `git diff --check` passed with line-ending warnings only.

Residual risk:

- UCF-Yjs recovery/divergence rows are classification fixtures until the
  durable generation and reload-validation features make them runtime-backed.

Gate status:

- Complete.
