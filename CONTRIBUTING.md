# Contributing

UCF-Yjs is a local MVP for a protocol-first citation runtime over Yjs. Keep
changes aligned with the documented authority boundaries: typed commands and
outcomes are the public semantic surface; providers persist and synchronize
Yjs state but do not own domain meaning.

## Development Setup

```bash
npm ci
npm run build
npm test
npm run test:conformance
npm run test:convergence
npm run test:e2e
```

Node.js 22 or newer is required.

## Change Guidelines

- Keep raw Yjs updates provider-internal for normal citation workflows.
- Preserve append-only semantic-log behavior and deterministic outcome hashes.
- Do not treat provider snapshots as checkpoints or accepted evidence.
- Route semantic document edits through `document.replace_range`.
- Keep checkpoint identity actor-neutral and capability-filter independent.
- Add focused tests for protocol, persistence, projection, checkpoint, or
  command-processor behavior when those contracts change.

## Documentation

- Root `README.md`, `docs/user-guide.md`, and `docs/agent-guide.md` are the
  public entry points.
- `README.dev.md`, `docs/implementation-log.md`, and `docs/reviews/` preserve
  development and review context.
- `build-docs/` is local planning material. It is ignored by Git and should
  not be re-added to the repository.

## Validation Before Pushing

Run the same commands as CI:

```bash
npm run build
npm test
npm run test:conformance
npm run test:convergence
npm run test:e2e
git diff --check
```
