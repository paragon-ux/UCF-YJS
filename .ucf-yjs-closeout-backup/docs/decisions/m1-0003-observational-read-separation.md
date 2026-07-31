# M1-0003 Observational Read Separation

## Decision

Route valid `status.get` and `agent_view.get` requests through a pure
observation path. They return deterministic projection responses but do not
append command, idempotency, or outcome records to the semantic log.

## Alternatives

- Keep M0 behavior where reads advance the semantic outcome chain.
- Add observation audit only after persistent workspace generations exist.
- Change checkpoint identity immediately to include the frontier profile.

## Reason

M1 requires observations to stop mutating semantic identity. The selected path
preserves historical M0 logs, introduces `ucf-yjs.semantic_frontier.v2`, and
keeps checkpoint identity stable across reads. The optional observation audit is
separate from semantic authority and failure-isolated.

## Canonical Or Compatibility Effect

Future `live_version` values include the semantic-frontier profile
`ucf-yjs.semantic_frontier.v2`. Historical M0 semantic logs remain valid and are
anchored through the registered v1-to-v2 frontier migration. Observation
response hashes use `ucf-yjs.observation_response.v1` and are not semantic
outcome-chain hashes.

## Migration Effect

The v1-to-v2 migration records the prior M0 frontier as an anchor and applies
the policy `status_and_agent_view_do_not_advance`. It does not rewrite,
delete, or reinterpret historical M0 records.

## Future Extension Point

Persistent workspace generations will decide whether observation audit records
are retained durably. Retained audit must remain outside semantic projections,
`live_version`, checkpoint identity, and accepted projection identity.
