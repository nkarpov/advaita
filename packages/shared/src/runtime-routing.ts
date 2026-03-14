import type { RuntimeResolution } from "./types.js";

const RUNTIME_ID_PATTERN = /^[A-Za-z0-9._-]+$/;

function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function buildExplicitPatterns(runtimeId: string): RegExp[] {
  const escapedRuntimeId = escapeRegex(runtimeId);
  return [
    new RegExp(`\\b(?:run|execute|do)\\s+(?:this\\s+)?as\\s+${escapedRuntimeId}\\b`, "i"),
    new RegExp(`\\b(?:run|execute|do)\\b[^\\n]{0,120}?\\b(?:on|in)\\s+${escapedRuntimeId}\\b`, "i"),
    new RegExp(`\\b(?:switch|route|move)\\s+(?:this\\s+)?(?:to|onto|over to)\\s+${escapedRuntimeId}\\b`, "i"),
    new RegExp(`\\b(?:you(?:'| a)?re|ur)\\s+(?:now\\s+)?(?:on|in)\\s+${escapedRuntimeId}\\b`, "i"),
    new RegExp(`^\\s*\\/runtime\\s+${escapedRuntimeId}(?:\\s+|$)`, "i"),
    new RegExp(`^\\s*\\/runas\\s+${escapedRuntimeId}(?:\\s+|$)`, "i"),
  ];
}

export function parseRequestedRuntime(text: string, availableRuntimeIds: string[]): string | null {
  const normalizedRuntimeIds = availableRuntimeIds
    .filter((runtimeId) => RUNTIME_ID_PATTERN.test(runtimeId))
    .sort((a, b) => b.length - a.length);

  for (const runtimeId of normalizedRuntimeIds) {
    for (const pattern of buildExplicitPatterns(runtimeId)) {
      if (pattern.test(text)) {
        return runtimeId;
      }
    }
  }

  return null;
}

export interface ResolveExecutionRuntimeInput {
  text: string;
  originRuntimeId: string;
  currentRuntimeId: string | null;
  availableRuntimeIds: string[];
}

export function resolveExecutionRuntime(input: ResolveExecutionRuntimeInput): RuntimeResolution {
  const requestedRuntimeId = parseRequestedRuntime(input.text, input.availableRuntimeIds);
  if (requestedRuntimeId) {
    return {
      executionRuntimeId: requestedRuntimeId,
      requestedRuntimeId,
      source: "explicit",
    };
  }

  if (input.availableRuntimeIds.includes(input.originRuntimeId)) {
    return {
      executionRuntimeId: input.originRuntimeId,
      requestedRuntimeId: null,
      source: "origin",
    };
  }

  if (input.currentRuntimeId && input.availableRuntimeIds.includes(input.currentRuntimeId)) {
    return {
      executionRuntimeId: input.currentRuntimeId,
      requestedRuntimeId: null,
      source: "current",
    };
  }

  throw new Error("No execution runtime available for submitted turn");
}
