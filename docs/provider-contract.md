# Provider Contract

Providers persist and synchronize collaborative state. They do not own domain
meaning, command outcomes, projection truth, or checkpoint identity.

## MVP Interface Shape

```ts
interface UcfYjsProvider {
  connect(workspaceId: string): Promise<ProviderSession>;
  disconnect(): Promise<void>;
  whenSynced(): Promise<void>;
  getStatus(): ProviderStatus;
  loadState(): Promise<Uint8Array | null>;
  saveState(update: Uint8Array): Promise<void>;
  exportState(): Promise<Uint8Array>;
  importState(update: Uint8Array): Promise<void>;
  saveProviderSnapshot?(label: string): Promise<string>;
  readProviderSnapshot?(snapshotId: string): Promise<Uint8Array>;
}
```

## Required MVP Providers

- In-memory deterministic provider for conformance and convergence tests.
- Local persistence provider for restart and reload tests.

## Provider Rules

- Provider state is operational data, not accepted checkpoint authority.
- Provider snapshot identifiers are excluded from checkpoint identity.
- Provider snapshot references may appear as non-identity checkpoint metadata.
- Providers must not expose an in-place active-workspace rewind as a domain
  restore operation.
- Provider APIs must not leak into command, reducer, checkpoint, or projection
  schemas.
- Memory and local providers must pass the same provider conformance suite.

## Awareness Boundary

Presence, cursors, connection status, local user display names, and sync
latency are awareness data. Awareness is excluded from semantic logs,
live-version identity, checkpoint identity, and accepted projections.

## Unclassified provider intake resolution

A non-empty provider update that is not byte-equivalent to committed provider
state is retained outside active workspace authority. Public runtime and CLI
surfaces can list and inspect pending intake using document IDs, lengths, and
digests without returning document text. Listing and inspection acquire the
same OS-backed workspace lock with a bounded wait, so concurrent intake
publication or discard cannot be misclassified as corruption.
`discardUnclassifiedProviderImport()` (or `import provider discard`) records the
operator and removes the retained intake under the writer lock. The operation
is idempotent and never applies, classifies, or accepts the imported state.
Checkpoint creation and current evidence acceptance remain blocked while any
pending intake exists.
