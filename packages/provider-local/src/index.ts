import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import * as Y from "yjs";

import { MemoryProvider, type FlushOptions } from "../../provider-memory/src/index.js";

export const providerLocalPackage = {
  name: "provider-local",
  responsibility: "local persisted Yjs provider"
} as const;

export class LocalProvider {
  private readonly memory = new MemoryProvider();

  constructor(private readonly statePath: string) {}

  static async open(statePath: string): Promise<LocalProvider> {
    const provider = new LocalProvider(statePath);
    try {
      const bytes = await readFile(statePath);
      provider.importState(new Uint8Array(bytes));
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") {
        throw error;
      }
    }
    return provider;
  }

  connect(clientId: string, doc = new Y.Doc()): Y.Doc {
    return this.memory.connect(clientId, doc);
  }

  disconnect(clientId: string): void {
    this.memory.disconnect(clientId);
  }

  reconnect(clientId: string): void {
    this.memory.reconnect(clientId);
  }

  flush(options: FlushOptions = {}): void {
    this.memory.flush(options);
  }

  sync(): void {
    this.memory.sync();
  }

  exportState(): Uint8Array {
    return this.memory.exportState();
  }

  importState(update: Uint8Array): void {
    this.memory.importState(update);
  }

  async save(): Promise<void> {
    await mkdir(dirname(this.statePath), { recursive: true });
    const temporary = `${this.statePath}.tmp-${process.pid}-${Date.now()}`;
    await writeFile(temporary, this.exportState());
    await rename(temporary, this.statePath);
  }

  async compact(): Promise<void> {
    const doc = new Y.Doc();
    Y.applyUpdate(doc, this.exportState());
    this.importState(Y.encodeStateAsUpdate(doc));
    await this.save();
  }
}
