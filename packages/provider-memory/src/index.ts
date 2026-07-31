import * as Y from "yjs";

export const providerMemoryPackage = {
  name: "provider-memory",
  responsibility: "deterministic in-memory Yjs provider"
} as const;

const PROVIDER_ORIGIN = "ucf-yjs.provider-memory";

export interface FlushOptions {
  readonly duplicate?: boolean;
  readonly reorder?: boolean;
}

interface ClientState {
  readonly doc: Y.Doc;
  readonly observer: (update: Uint8Array, origin: unknown) => void;
  connected: boolean;
}

interface PendingUpdate {
  readonly origin_client_id: string;
  readonly update: Uint8Array;
}

export class MemoryProvider {
  private readonly clients = new Map<string, ClientState>();
  private readonly pending: PendingUpdate[] = [];
  private stateUpdate: Uint8Array = Y.encodeStateAsUpdate(new Y.Doc());

  connect(clientId: string, doc = new Y.Doc()): Y.Doc {
    if (this.clients.has(clientId)) {
      throw new Error(`provider client already exists: ${clientId}`);
    }
    Y.applyUpdate(doc, this.stateUpdate, PROVIDER_ORIGIN);
    const observer = (update: Uint8Array, origin: unknown): void => {
      if (origin === PROVIDER_ORIGIN) {
        return;
      }
      const client = this.clients.get(clientId);
      if (client !== undefined && !client.connected) {
        return;
      }
      this.pending.push({ origin_client_id: clientId, update: new Uint8Array(update) });
      this.mergeIntoProviderState(update);
    };
    doc.on("update", observer);
    this.clients.set(clientId, { doc, observer, connected: true });
    return doc;
  }

  disconnect(clientId: string): void {
    const client = this.requireClient(clientId);
    client.connected = false;
  }

  reconnect(clientId: string): void {
    const client = this.requireClient(clientId);
    this.mergeIntoProviderState(Y.encodeStateAsUpdate(client.doc));
    client.connected = true;
    this.sync();
  }

  flush(options: FlushOptions = {}): void {
    const updates = this.pending.splice(0);
    const ordered = options.reorder ? [...updates].reverse() : updates;
    const deliver = options.duplicate ? [...ordered, ...ordered] : ordered;
    for (const item of deliver) {
      for (const [clientId, client] of this.clients.entries()) {
        if (!client.connected || clientId === item.origin_client_id) {
          continue;
        }
        Y.applyUpdate(client.doc, item.update, PROVIDER_ORIGIN);
      }
    }
  }

  sync(): void {
    for (const client of this.clients.values()) {
      if (client.connected) {
        Y.applyUpdate(client.doc, this.stateUpdate, PROVIDER_ORIGIN);
      }
    }
    this.flush();
  }

  exportState(): Uint8Array {
    return new Uint8Array(this.stateUpdate);
  }

  importState(update: Uint8Array): void {
    const doc = new Y.Doc();
    Y.applyUpdate(doc, this.stateUpdate, PROVIDER_ORIGIN);
    Y.applyUpdate(doc, update, PROVIDER_ORIGIN);
    this.stateUpdate = Y.encodeStateAsUpdate(doc);
    this.sync();
  }

  destroy(): void {
    for (const client of this.clients.values()) {
      client.doc.off("update", client.observer);
    }
    this.clients.clear();
    this.pending.splice(0);
  }

  private mergeIntoProviderState(update: Uint8Array): void {
    const doc = new Y.Doc();
    Y.applyUpdate(doc, this.stateUpdate, PROVIDER_ORIGIN);
    Y.applyUpdate(doc, update, PROVIDER_ORIGIN);
    this.stateUpdate = Y.encodeStateAsUpdate(doc);
  }

  private requireClient(clientId: string): ClientState {
    const client = this.clients.get(clientId);
    if (client === undefined) {
      throw new Error(`unknown provider client: ${clientId}`);
    }
    return client;
  }
}
