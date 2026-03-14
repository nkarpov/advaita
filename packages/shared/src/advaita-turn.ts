import type { SessionEntry } from "@mariozechner/pi-coding-agent";
import type { AdvaitaTurnEntryData } from "./types.js";

export const ADVAITA_TURN_CUSTOM_TYPE = "advaita.turn";

export function isAdvaitaTurnEntry(
  entry: SessionEntry,
): entry is Extract<SessionEntry, { type: "custom" }> & { data?: AdvaitaTurnEntryData } {
  return entry.type === "custom" && entry.customType === ADVAITA_TURN_CUSTOM_TYPE;
}
