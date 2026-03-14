import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { randomUUID } from "node:crypto";
import { dirname, join } from "node:path";
import {
  parseSessionEntries,
  type SessionEntry,
  type SessionHeader,
} from "@mariozechner/pi-coding-agent";
import type { SessionMetadata, SessionSnapshot } from "@advaita/shared";

interface SessionIndexRecord {
  metadataPath: string;
  sessionPath: string;
}

type SessionIndex = Record<string, SessionIndexRecord>;

function cloneSnapshot(snapshot: SessionSnapshot): SessionSnapshot {
  return {
    header: structuredClone(snapshot.header),
    entries: structuredClone(snapshot.entries),
    metadata: structuredClone(snapshot.metadata),
  };
}

function safeSessionName(name: string): string {
  return name.replace(/[^A-Za-z0-9._-]+/g, "-");
}

function lastEntryId(entries: SessionEntry[]): string | null {
  return entries.length > 0 ? entries[entries.length - 1]!.id : null;
}

function createEmptySessionSnapshot(name: string, now: string): SessionSnapshot {
  return {
    header: {
      type: "session",
      version: 3,
      id: randomUUID(),
      timestamp: now,
      cwd: `/advaita/${name}`,
    },
    entries: [],
    metadata: {
      name,
      createdAt: now,
      updatedAt: now,
      revision: 0,
      currentRuntimeId: null,
      activeTurnId: null,
    },
  };
}

function readSnapshotFromDisk(record: SessionIndexRecord): SessionSnapshot | null {
  if (!existsSync(record.sessionPath) || !existsSync(record.metadataPath)) {
    return null;
  }

  const raw = readFileSync(record.sessionPath, "utf8");
  const parsed = parseSessionEntries(raw);
  const header = parsed.find((entry): entry is SessionHeader => entry.type === "session");
  if (!header) {
    return null;
  }

  const metadata = JSON.parse(readFileSync(record.metadataPath, "utf8")) as SessionMetadata;
  return {
    header,
    entries: parsed.filter((entry): entry is SessionEntry => entry.type !== "session"),
    metadata,
  };
}

function writeSnapshotToDisk(snapshot: SessionSnapshot, record: SessionIndexRecord): void {
  mkdirSync(dirname(record.sessionPath), { recursive: true });
  mkdirSync(dirname(record.metadataPath), { recursive: true });
  const lines = [JSON.stringify(snapshot.header), ...snapshot.entries.map((entry) => JSON.stringify(entry))];
  writeFileSync(record.sessionPath, `${lines.join("\n")}\n`, "utf8");
  writeFileSync(record.metadataPath, `${JSON.stringify(snapshot.metadata, null, 2)}\n`, "utf8");
}

export interface SessionStoreOptions {
  rootDir: string;
  now?: () => string;
}

export class SessionStore {
  private readonly rootDir: string;
  private readonly indexPath: string;
  private readonly cache = new Map<string, SessionSnapshot>();
  private readonly now: () => string;

  constructor(options: SessionStoreOptions | string) {
    if (typeof options === "string") {
      this.rootDir = options;
      this.now = () => new Date().toISOString();
    } else {
      this.rootDir = options.rootDir;
      this.now = options.now ?? (() => new Date().toISOString());
    }
    this.indexPath = join(this.rootDir, "index.json");
    mkdirSync(this.rootDir, { recursive: true });
  }

  load(name: string): SessionSnapshot {
    const cached = this.cache.get(name);
    if (cached) {
      return cloneSnapshot(cached);
    }

    const record = this.getRecord(name);
    const loaded = record ? readSnapshotFromDisk(record) : null;
    if (loaded) {
      this.cache.set(name, loaded);
      return cloneSnapshot(loaded);
    }

    const snapshot = createEmptySessionSnapshot(name, this.now());
    this.persist(name, snapshot);
    return cloneSnapshot(snapshot);
  }

  appendEntries(name: string, entries: SessionEntry[], metadataPatch?: Partial<SessionMetadata>): SessionSnapshot {
    const snapshot = this.loadMutable(name);
    snapshot.entries.push(...structuredClone(entries));
    const now = this.now();
    snapshot.metadata = {
      ...snapshot.metadata,
      ...metadataPatch,
      updatedAt: now,
      revision: snapshot.metadata.revision + 1,
    };
    this.persist(name, snapshot);
    return cloneSnapshot(snapshot);
  }

  updateMetadata(name: string, patch: Partial<SessionMetadata>): SessionSnapshot {
    const snapshot = this.loadMutable(name);
    const now = this.now();
    snapshot.metadata = {
      ...snapshot.metadata,
      ...patch,
      updatedAt: now,
      revision: snapshot.metadata.revision + 1,
    };
    this.persist(name, snapshot);
    return cloneSnapshot(snapshot);
  }

  getLeafId(name: string): string | null {
    return lastEntryId(this.loadMutable(name).entries);
  }

  private loadMutable(name: string): SessionSnapshot {
    const cached = this.cache.get(name);
    if (cached) {
      return cached;
    }
    const snapshot = this.load(name);
    this.cache.set(name, snapshot);
    return snapshot;
  }

  private persist(name: string, snapshot: SessionSnapshot): void {
    const record = this.ensureRecord(name);
    writeSnapshotToDisk(snapshot, record);
    this.cache.set(name, snapshot);
  }

  private ensureRecord(name: string): SessionIndexRecord {
    const index = this.readIndex();
    const existing = index[name];
    if (existing) {
      return existing;
    }

    const safeName = safeSessionName(name);
    const dir = join(this.rootDir, "sessions", safeName);
    mkdirSync(dir, { recursive: true });
    const record: SessionIndexRecord = {
      sessionPath: join(dir, "session.jsonl"),
      metadataPath: join(dir, "metadata.json"),
    };
    index[name] = record;
    writeFileSync(this.indexPath, `${JSON.stringify(index, null, 2)}\n`, "utf8");
    return record;
  }

  private getRecord(name: string): SessionIndexRecord | null {
    const index = this.readIndex();
    return index[name] ?? null;
  }

  private readIndex(): SessionIndex {
    if (!existsSync(this.indexPath)) {
      return {};
    }

    try {
      return JSON.parse(readFileSync(this.indexPath, "utf8")) as SessionIndex;
    } catch {
      return {};
    }
  }
}
