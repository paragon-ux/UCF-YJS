# Citation Domain Contract

The MVP domain is source-clean citation lifecycle. It is intentionally narrow
and must not grow into a generic evidence graph during M0/MVP.

## Commands

- `workspace.create`
- `document.create`
- `document.replace_range`
- `citation.activate`
- `citation.resolve`
- `citation.accept_current`
- `citation.deactivate`
- `checkpoint.create`
- `agent_view.get`
- `status.get`

## Citation Resource

```json
{
  "resource_id": "cit_123",
  "handle": "AUTH-ROTATE",
  "document_id": "doc_123",
  "anchor_id": "anc_123",
  "accepted_evidence": {
    "content_hash": "sha256:...",
    "byte_count": 11,
    "line_count": 2
  },
  "current_evidence": {
    "content_hash": "sha256:..."
  },
  "status": "valid",
  "allowed_actions": []
}
```

## Statuses

- `valid`: current evidence hash equals accepted evidence hash.
- `changed_unaccepted`: anchors resolve, but current evidence differs.
- `missing`: anchor or target no longer resolves to evidence.
- `ambiguous`: multiple legitimate candidates exist and no deterministic
  semantic choice is allowed.
- `inactive`: citation is intentionally disabled.

## Reducer Rules

- Activation requires explicit document selection.
- Citation identity is separate from evidence identity and anchor identity.
- Accepted evidence hash is set only by activation or `citation.accept_current`.
- Edits before a citation may preserve `valid` after anchor transformation.
- Edits inside accepted evidence produce `changed_unaccepted`.
- Anchor survival does not imply acceptance.
- Exact ambiguity is reported, not guessed.
- No lineage is inferred from matching text, path reuse, locator proximity, or
  anchor survival.

## UCF-RS Conformance Translation

UCF-Yjs should reproduce UCF-RS behaviors as independent conformance tests:

- explicit activation over selected text;
- source-clean overlays;
- edits outside evidence preserve validity;
- edits inside evidence require acceptance;
- deletion reports missing;
- unmanaged or ambiguous recovery is conservative;
- accepted evidence is never updated implicitly.

The tests must encode expected behavior, not UCF-RS storage schemas or hashes.
