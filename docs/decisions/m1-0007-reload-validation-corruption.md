# M1.7 Reload Validation and Corruption Fixtures

Status: accepted

Durable workspace open now has a typed validation surface:
`validateDurableWorkspace(root, workspace_id)`. It returns stable result codes
instead of exposing raw filesystem paths or internal exceptions.

Reload validation checks generation manifest identity, component digests,
schema support, semantic-log chain validity, idempotency references, processor
workspace/reducer identity, serialized anchors, citation and anchor component
agreement, checkpoint manifests and retained documents, provider document state,
and deterministic projection rebuild against the last semantic live version.

The corruption fixture suite mutates one otherwise valid workspace generation
per fixture and asserts fail-closed behavior. No fixture repairs or accepts
evidence, and diagnostics are redacted.
