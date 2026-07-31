# D2 Protocol Review

## Scope

- `packages/protocol/src/index.ts`
- `tests/conformance/protocol.test.ts`

## Findings

No findings.

## Corrective Passes During Review

- Fixed outcome validation so unsupported outcome codes are rejected.
- Fixed outcome validation so required nullable frontier fields cannot be omitted.
- Fixed whole-envelope JSON validation so accepted command and outcome envelopes cannot later fail canonical hashing because of non-JSON extras.
- Aligned missing outcome schema-version rejection with command schema-version rejection.

## Verification

- `npm run test:conformance`: pass, 17 tests.
- `npm test`: pass, 20 tests.
- `git diff --check`: pass.

## Residual Risk

- D2 defines shared protocol primitives only. Operation-specific command payload schemas are intentionally deferred to the command processor and domain package features.
