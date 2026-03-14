import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import type { SessionEntry } from "@mariozechner/pi-coding-agent";
import { SessionStore } from "../src/session-store.js";

function userEntry(text: string): SessionEntry {
  return {
    type: "message",
    id: `entry-${text}`,
    parentId: null,
    timestamp: "2026-03-14T00:00:00.000Z",
    message: {
      role: "user",
      content: text,
      timestamp: 1,
    },
  } satisfies SessionEntry;
}

describe("SessionStore", () => {
  it("creates, persists, and reloads Pi-shaped sessions", () => {
    const rootDir = mkdtempSync(join(tmpdir(), "advaita-broker-store-"));
    const store = new SessionStore({ rootDir, now: () => "2026-03-14T00:00:00.000Z" });

    const initial = store.load("demo");
    expect(initial.entries).toHaveLength(0);
    expect(initial.metadata.name).toBe("demo");
    expect(initial.metadata.revision).toBe(0);

    store.appendEntries("demo", [userEntry("hello")], { currentRuntimeId: "mac" });

    const reloaded = new SessionStore({ rootDir, now: () => "2026-03-14T00:00:01.000Z" }).load("demo");
    expect(reloaded.entries).toHaveLength(1);
    expect(reloaded.metadata.currentRuntimeId).toBe("mac");
    expect(reloaded.metadata.revision).toBe(1);
    expect(reloaded.header.type).toBe("session");
  });
});
