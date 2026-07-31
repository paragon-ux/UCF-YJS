# Yjs M0 Spike Report

Spike script: `spikes/yjs-m0-spike.cjs`

Status: disposable M0 evidence, not production authority.

## Command

```bash
node spikes/yjs-m0-spike.cjs
```

Observed result:

```json
{
  "ok": true,
  "yjs": "13.6.31",
  "reordered_converges": "AB",
  "duplicate_updates_harmless": true,
  "offline_exchange_converges": "helloworld",
  "relative_positions": {
    "start": 4,
    "end": 6
  },
  "boundary_policy_probe": {
    "left_assoc": 2,
    "right_assoc": 3
  },
  "deleted_anchor_detectable": true,
  "provider_neutral_export_import": true
}
```

## Evidence

The spike proves these M0 requirements at assertion level:

- reordered Yjs updates converge;
- duplicate updates are harmless;
- offline updates converge after exchange;
- RelativePositions resolve identically after synchronization;
- boundary insertion behavior can be specified by association choice;
- deleted anchors yield a detectable unresolved or empty state;
- provider-neutral state export/import is feasible through encoded Yjs updates.

## Boundary Policy Decision

MVP citations will record explicit boundary association policy. A citation range
uses a start RelativePosition and an end RelativePosition. Boundary insertion
behavior is not inferred globally; it is a domain policy input to
`citation.activate`.

Initial policy names:

- `outside`: boundary insertions are outside accepted evidence when possible.
- `inside`: boundary insertions are inside accepted evidence when possible.

The reducer must translate Yjs RelativePosition association behavior into these
domain policies and produce deterministic status classifications.

## Deleted Anchor Decision

If either citation boundary cannot resolve, or resolves to an empty/deleted
target, the projection reports `missing` or `anchor_unresolved`. It must not
guess a replacement range.

## Provider-Neutral Decision

Yjs encoded state/update bytes are acceptable provider interchange material.
They are not public semantic command payloads and are not accepted checkpoint
identity.

## Future Test Translation

C4 spike assertions should become permanent convergence tests during MVP
implementation:

- reordered update convergence;
- duplicate update idempotence;
- offline exchange convergence;
- relative anchor agreement after sync;
- boundary policy behavior;
- deleted anchor classification;
- provider-neutral export/import.
