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
