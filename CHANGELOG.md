# Changelog

## Unreleased

- Begin M1 durable local protocol runtime planning from the signed-off M0
  baseline. No runtime behavior changes are included in the M1.1 release
  baseline record.
- Add the M1.2 schema registry, compatibility validator, identity migration
  tests, and `npm run test:migrations`.
- Move valid `status.get` and `agent_view.get` requests onto a non-semantic
  observation path with semantic-frontier profile v2 migration coverage.

## v0.1.0-m0 - Proposed

- Establish the UCF-Yjs local MVP baseline: typed command and outcome protocol,
  semantic log, deterministic projections, actor-neutral checkpoints, memory
  and local providers, citation reducer, headless JSONL transport, restart
  persistence, convergence tests, and vertical E2E coverage.
- Keep the baseline private and local. This release is not an npm publication
  and does not include editor/workbench, Velt, MCP, Git/W3C, hosted service, or
  package publication scope.
