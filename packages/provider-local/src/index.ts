import { mkdir, open as openFile, readFile, rename, rm } from "node:fs/promises";
import { dirname } from "node:path";
import * as Y from "yjs";

import { MemoryProvider, type FlushOptions } from "../../provider-memory/src/index.js";

export const providerLocalPackage = {
  name: "provider-local",
  responsibility: "local persisted Yjs provider"
} as const;

export interface LocalWorkspaceSnapshot {
  readonly schema_version: "ucf-yjs.local_workspace_snapshot.v1";
  readonly provider_state: string;
  readonly authority: unknown;
}

export class LocalProvider {
  private readonly memory = new MemoryProvider();
  private authority: unknown = null;

  constructor(private readonly statePath: string) {}

  static async open(statePath: string): Promise<LocalProvider> {
    const provider = new LocalProvider(statePath);
    try {
      const bytes = await readFile(statePath);
      const snapshot = parseWorkspaceSnapshot(bytes);
      if (snapshot === null) {
        provider.importState(new Uint8Array(bytes));
      } else {
        provider.importState(Uint8Array.from(Buffer.from(snapshot.provider_state, "base64")));
        provider.authority = snapshot.authority;
      }
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
    await writeAtomic(this.statePath, this.exportState());
  }

  async saveWorkspace(authority: unknown): Promise<void> {
    this.authority = structuredClone(authority);
    const snapshot: LocalWorkspaceSnapshot = {
      schema_version: "ucf-yjs.local_workspace_snapshot.v1",
      provider_state: Buffer.from(this.exportState()).toString("base64"),
      authority: this.authority
    };
    await writeAtomic(this.statePath, Buffer.from(JSON.stringify(snapshot), "utf8"));
  }

  authoritySnapshot<T = unknown>(): T | null {
    return this.authority === null || this.authority === undefined ? null : structuredClone(this.authority) as T;
  }

  async compact(): Promise<void> {
    const doc = new Y.Doc();
    Y.applyUpdate(doc, this.exportState());
    this.importState(Y.encodeStateAsUpdate(doc));
    if (this.authority === null) {
      await this.save();
      return;
    }
    await this.saveWorkspace(this.authority);
  }
}

function parseWorkspaceSnapshot(bytes: Uint8Array): LocalWorkspaceSnapshot | null {
  try {
    const parsed = JSON.parse(Buffer.from(bytes).toString("utf8")) as Partial<LocalWorkspaceSnapshot>;
    if (
      parsed.schema_version === "ucf-yjs.local_workspace_snapshot.v1" &&
      typeof parsed.provider_state === "string" &&
      "authority" in parsed
    ) {
      return parsed as LocalWorkspaceSnapshot;
    }
  } catch {
    return null;
  }
  return null;
}

async function writeAtomic(path: string, data: Uint8Array): Promise<void> {
  await mkdir(dirname(path), { recursive: true });
  const temporary = `${path}.tmp-${process.pid}-${Date.now()}`;
  let file;
  try {
    file = await openFile(temporary, "w");
    await file.writeFile(data);
    await file.sync();
    await file.close();
    file = undefined;
    await rename(temporary, path);
    await syncDirectory(dirname(path));
  } catch (error) {
    if (file !== undefined) {
      await file.close().catch(() => undefined);
    }
    await rm(temporary, { force: true }).catch(() => undefined);
    throw error;
  }
}

async function syncDirectory(path: string): Promise<void> {
  try {
    const directory = await openFile(path, "r");
    try {
      await directory.sync();
    } finally {
      await directory.close();
    }
  } catch {
    // Directory fsync is not available on every supported platform/filesystem.
  }
}
