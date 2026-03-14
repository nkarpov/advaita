import { randomUUID } from "node:crypto";
import type { SessionEntry } from "@mariozechner/pi-coding-agent";
import { ADVAITA_TURN_CUSTOM_TYPE, type AdvaitaTurnEntryData } from "@advaita/shared";

export function generateEntryId(): string {
  return randomUUID().slice(0, 8);
}

export function lastEntryId(entries: SessionEntry[]): string | null {
  return entries.length > 0 ? entries[entries.length - 1]!.id : null;
}

export function createMessageEntry(
  message: Extract<SessionEntry, { type: "message" }>['message'],
  parentId: string | null,
): SessionEntry {
  return {
    type: "message",
    id: generateEntryId(),
    parentId,
    timestamp: new Date().toISOString(),
    message,
  } satisfies SessionEntry;
}

export function createCustomEntry(customType: string, data: unknown, parentId: string | null): SessionEntry {
  return {
    type: "custom",
    id: generateEntryId(),
    parentId,
    timestamp: new Date().toISOString(),
    customType,
    data,
  } satisfies SessionEntry;
}

export function createAdvaitaTurnEntry(data: AdvaitaTurnEntryData, parentId: string | null): SessionEntry {
  return createCustomEntry(ADVAITA_TURN_CUSTOM_TYPE, data, parentId);
}

export function createAssistantErrorEntry(errorMessage: string, parentId: string | null): SessionEntry {
  const message = {
    role: "assistant",
    content: [{ type: "text", text: `Execution error: ${errorMessage}` }],
    provider: "advaita",
    model: "execution-error",
    api: "advaita",
    usage: {
      input: 0,
      output: 0,
      cacheRead: 0,
      cacheWrite: 0,
      totalTokens: 0,
      cost: {
        input: 0,
        output: 0,
        cacheRead: 0,
        cacheWrite: 0,
        total: 0,
      },
    },
    stopReason: "error",
    errorMessage,
    timestamp: Date.now(),
  } satisfies Extract<SessionEntry, { type: "message" }>['message'];
  return createMessageEntry(message, parentId);
}
