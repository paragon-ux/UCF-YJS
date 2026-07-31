# D4 Projections Review

## Scope

- `packages/projections/src/index.ts`
- `tests/projections.test.ts`

## Findings

No findings.

## Corrective Passes During Review

- Fixed capability filtering so top-level returned document projections redact content when `can_read_content` is false.
- Preserved actor-neutral accepted projection identity by hashing unfiltered identity inputs separately from returned capability-filtered projections.

## Verification

- `npm run build`: pass.
- `npm test`: pass, 32 tests.
- `npm run test:conformance`: pass, 17 tests.
- `git diff --check`: pass.

## Residual Risk

- D4 interprets citation and conflict projection events from semantic outcomes. Operation-specific event production is completed in the command processor and domain reducer features.
