# M1.3 Observational-Read Separation Review

Review target: M1.3 observation routing, semantic-frontier v2 migration, tests,
and docs.

## Findings

No unresolved findings.

## Fixed During Review

- The optional observation audit sequence was originally incremented only after
  the audit sink returned. If a sink wrote a record and then threw, the next
  observation could reuse the same audit sequence. The processor now reserves
  the sequence before invoking the non-authoritative audit sink, and the
  failure-isolation test covers two failed appends.

## Assessment

- Valid `status.get` and `agent_view.get` requests bypass semantic command,
  idempotency, and outcome append.
- Repeated observations preserve semantic log bytes, workspace sequence,
  `live_version`, and checkpoint ID.
- Mutations after observations still advance the semantic frontier.
- Historical M0 semantic logs with read outcomes remain valid and migrate by
  anchoring the M0 frontier under `ucf-yjs.semantic_frontier.v2`.

## Verification

- `npm run build`: pass.
- Focused processor/CLI tests: pass, 15 tests.
- `npm run test:migrations`: pass, 7 tests.
- `npm test`: pass, 70 tests.
- `npm run test:conformance`: pass, 18 tests.
- `npm run test:convergence`: pass, 5 tests.
- `npm run test:e2e`: pass, 2 tests.

## Residual Risk

Observation audit is still in-process and optional. Durable retention belongs
to the recoverable workspace generation work.
