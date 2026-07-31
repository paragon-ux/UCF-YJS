# Schema Evolution

UCF-Yjs command, outcome, checkpoint, projection, and provider contracts are
schema-versioned from the first MVP.

## Version Rules

- Commands remain immutable in their original schema.
- Outcomes remain immutable in their original schema.
- Reducers declare supported input schema versions.
- Upcasts are deterministic pure functions.
- Unsupported schema versions return typed outcomes instead of silent rewrite.
- Incompatible clients become read-only for unsupported writes.
- Checkpoints record domain schema and reducer versions.
- Projection responses include schema version and reducer version.

## MVP Supported Versions

| Contract | Initial Version |
| --- | --- |
| Command | `ucf-yjs.command.v1` |
| Outcome | `ucf-yjs.outcome.v1` |
| Citation domain | `ucf-yjs.citations.v1` |
| Citation reducer | `ucf-yjs.citations.reducer.v1` |
| Agent view | `ucf-yjs.agent_view.v1` |
| Checkpoint | `ucf-yjs.checkpoint.v1` |
| Provider export | `ucf-yjs.provider_export.v1` |

M1 adds the authoritative registry in `schemas/registry.json`, with validator
coverage in `packages/protocol/src/schema-registry.ts` and public
documentation in `docs/schema-registry.md`.

## Mixed-Client Behavior

- A client may read projections for older compatible schemas.
- A client may submit commands only when it supports the command schema and the
  processor supports deterministic validation for that schema.
- If a command can be safely upcast, the outcome records both original schema
  and applied schema.
- If a command cannot be safely upcast, return
  `UCFY_REJECTED_UNSUPPORTED_SCHEMA`.
- Checkpoint verification uses the historical reducer or a documented
  compatible upcast path.

## Migration Records

Future migrations are semantic-log records, not ad hoc provider rewrites. A
migration must include actor attribution, source schema, target schema,
deterministic digest of the migration input, and a typed outcome.

M1.3 adds the forward-only semantic-frontier profile transition from
`ucf-yjs.semantic_frontier.v1` to `ucf-yjs.semantic_frontier.v2`. The migration
anchors the historical M0 frontier and applies the policy that `status.get` and
`agent_view.get` do not advance semantic identity for future reads.
