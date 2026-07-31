# Canonicalization

M0 chooses one canonical JSON profile for protocol, semantic-log, projection,
live-version, and checkpoint digests.

## Canonical JSON Profile

Canonical bytes are UTF-8 JSON with:

- object keys sorted by Unicode code point;
- arrays preserved in semantic order;
- no insignificant whitespace;
- strings normalized to Unicode NFC before encoding;
- integers encoded as JSON numbers;
- no `NaN`, infinity, undefined, functions, comments, or trailing commas;
- timestamps included in identity only when a profile explicitly requires a
  deterministic timestamp value;
- absent optional fields omitted rather than serialized as `null`, unless the
  schema states that `null` changes meaning.

All digest inputs are framed:

```text
digest = sha256(domain || "\n" || canonical_json_bytes)
```

Returned digest strings use lowercase hex:

```text
sha256:<64 lowercase hex characters>
```

## Domain Separators

| Purpose | Domain |
| --- | --- |
| Command payload digest | `ucf-yjs.command_payload.v1` |
| Command record hash | `ucf-yjs.command_record.v1` |
| Outcome record hash | `ucf-yjs.outcome_record.v1` |
| Outcome chain hash | `ucf-yjs.outcome_chain.v1` |
| Collaborative document digest | `ucf-yjs.document.v1` |
| Anchor projection digest | `ucf-yjs.anchor_projection.v1` |
| Accepted projection digest | `ucf-yjs.accepted_projection.v1` |
| Agent view response digest | `ucf-yjs.agent_view_response.v1` |
| Live projection digest | `ucf-yjs.live_projection.v1` |
| Live version | `ucf-yjs.live.v1` |
| Checkpoint ID | `ucf-yjs.checkpoint.v1` |

## Command Payload Digest

Hash the canonical command body that excludes transport and retry metadata:

```json
{
  "operation": "citation.activate",
  "target": {},
  "payload": {}
}
```

`command_id`, `idempotency_key`, timestamps, and transport correlation fields
are excluded from the payload digest. They remain in the command record hash.

## Command Record Hash

Hash the canonical command envelope without `command_hash`. The command record
includes actor, workspace, observed version, operation, target, payload,
command ID, idempotency key, and schema version.

## Outcome Record Hash

Hash the canonical outcome envelope without `outcome_hash` and without
`new_live_version`.

Hash-authoritative outcome fields are command ID, outcome category, stable
code, workspace sequence, previous outcome hash, previous live version,
affected resources, events, allowed actions, and diagnostics.

`new_live_version` is deliberately non-hash-authoritative because it is derived
from the post-command semantic frontier, and that frontier includes the outcome
hash. The processor stages reducer state, derives the prospective outcome hash
from the hash-authoritative body, computes the post-command live version from
that prospective frontier, and appends one final immutable outcome carrying the
derived `new_live_version`.

## Outcome Chain Hash

```json
{
  "workspace_id": "ws_123",
  "workspace_sequence": 7,
  "previous_outcome_hash": "sha256:...",
  "outcome_hash": "sha256:..."
}
```

The latest outcome chain hash plus workspace sequence is the MVP semantic
frontier.

## Live Version

Compute:

```text
live_projection_digest = H(
  "ucf-yjs.live_projection.v1",
  canonical_collaborative_domain_projection
)

live_version = H(
  "ucf-yjs.live.v1",
  {
    "workspace_id": workspace_id,
    "collaborative_schema_version": collaborative_schema_version,
    "domain_schema_version": domain_schema_version,
    "reducer_version": reducer_version,
    "live_projection_digest": live_projection_digest,
    "semantic_frontier": {
      "workspace_sequence": workspace_sequence,
      "outcome_chain_hash": outcome_chain_hash
    }
  }
)
```

Excluded from `live_version`:

- provider snapshot IDs;
- awareness and presence;
- connection state;
- capability-filtered agent views;
- display preferences;
- non-deterministic timestamps.

## Projection Digests

Projection digests hash canonical projection records after deterministic
ordering by stable IDs. Capability-filtered agent views receive response
digests for that exact returned view, but those digests are never checkpoint
identity inputs.
