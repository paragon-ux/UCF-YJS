# Schema Registry

M1.2 introduces an in-repository schema registry at `schemas/registry.json` and
a TypeScript validator in `packages/protocol/src/schema-registry.ts`.

The registry is the local index of supported authority formats. It records
reader and writer compatibility explicitly so newer or unknown schema versions
are not guessed.

## Baseline

| Project | Role | Commit |
| --- | --- | --- |
| UCF-RS | Independent foundation oracle baseline | `2b92f0cedeb987893479b39e9391d49b4f5c39c3` |
| UCF-Yjs | M0 local MVP baseline | `52c15db5073a2e3f5eee6283c2ed79430c1d14af` |

## Compatibility Vocabulary

| Field | Values |
| --- | --- |
| `status` | `supported`, `reserved`, `deprecated` |
| `read` | `supported`, `read_only`, `unsupported` |
| `write` | `supported`, `unsupported` |
| `compatibility` | An explicit named policy such as `identity`, `m0_outcome_chain_frontier`, or `m1_observations_do_not_advance_frontier` |
| `migrations.kind` | `identity` or `m0_frontier_anchor` |

`supported` entries are readable and writable by the current M1 code.
`reserved` entries are named for compatibility planning but are not read or
written until their feature implements the storage or log surface. Workspace
generation v1 was reserved earlier in M1 planning; it is supported by the
current durable runtime.

## Registered Artifacts

| Artifact | Current version | M1 write status |
| --- | --- | --- |
| Command schema | `ucf-yjs.command.v1` | Supported |
| Outcome schema | `ucf-yjs.outcome.v1` | Supported |
| Canonicalization profile | `ucf-yjs.canonical_json.v1` | Supported |
| Semantic frontier profile | `ucf-yjs.semantic_frontier.v1` | Deprecated, readable M0 profile |
| Semantic frontier profile | `ucf-yjs.semantic_frontier.v2` | Supported writer profile |
| Observation log schema | `ucf-yjs.observation_log.v1` | Supported |
| Processor snapshot schema | `ucf-yjs.processor_snapshot.v1` | Supported |
| Checkpoint manifest schema | `ucf-yjs.checkpoint.v1` | Supported |
| Provider snapshot schema | `ucf-yjs.local_workspace_snapshot.v1` | Supported |
| Workspace generation schema | `ucf-yjs.workspace_generation.v1` | Supported |
| Citation domain schema | `ucf-yjs.citations.v1` | Supported |
| Reducer version | `ucf-yjs.reducer.v1` | Supported |

## Migration Policy

M1.2 implemented identity migrations first. M1.3 added the forward-only
`ucf-yjs.semantic_frontier.v1` to `ucf-yjs.semantic_frontier.v2` migration. The
v2 profile anchors the M0 frontier and applies the policy that `status.get` and
`agent_view.get` do not advance semantic identity. Historical M0 semantic read
records remain valid for idempotent retry before the M1 observation path is
used for new reads.

Unsupported versions return typed incompatibility through
`UCFY_REJECTED_UNSUPPORTED_SCHEMA` or open read-only where the caller uses the
registry compatibility API.

## Deferred Normalization

Some planning docs use `ucf-yjs.citations.reducer.v1` as the desired citation
reducer name. The current implementation writes `ucf-yjs.reducer.v1`. M1.2
registers the implementation value as the M0-compatible reducer version. A
future reducer rename requires an explicit migration and compatibility entry.
