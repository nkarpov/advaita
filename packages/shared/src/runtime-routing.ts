import type { RuntimeResolution, RuntimeScope } from "./types.js";

const RUNTIME_ID_PATTERN = /^[A-Za-z0-9._-]+$/;

function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function buildTurnPatterns(runtimeId: string): RegExp[] {
  const escapedRuntimeId = escapeRegex(runtimeId);
  return [
    new RegExp(`\\b(?:run|execute|do)\\s+(?:this\\s+)?as\\s+${escapedRuntimeId}\\b`, "i"),
    new RegExp(`\\b(?:run|execute|do)\\b[^\\n]{0,160}?\\b(?:on|in)\\s+${escapedRuntimeId}\\b`, "i"),
    new RegExp(`\\broute\\s+(?:this\\s+)?(?:to|onto|over\\s+to)\\s+${escapedRuntimeId}\\b`, "i"),
    new RegExp(`\\bhave\\s+${escapedRuntimeId}\\s+(?:do|handle|run)\\b`, "i"),
    new RegExp(`^\\s*\\/runas\\s+${escapedRuntimeId}(?:\\s+|$)`, "i"),
  ];
}

function buildSessionPatterns(runtimeId: string): RegExp[] {
  const escapedRuntimeId = escapeRegex(runtimeId);
  return [
    new RegExp(`\\b(?:switch|move)\\s+(?:this\\s+)?(?:to|onto|over\\s+to)\\s+${escapedRuntimeId}\\b`, "i"),
    new RegExp(`\\b(?:stay|keep(?:\\s+working)?|from\\s+now\\s+on\\s+use)\\s+(?:on|in)?\\s*${escapedRuntimeId}\\b`, "i"),
    new RegExp(`\\b(?:you(?:'| a)?re|ur)\\s+(?:now\\s+)?(?:on|in)\\s+${escapedRuntimeId}\\b`, "i"),
    new RegExp(`^\\s*\\/runtime\\s+${escapedRuntimeId}(?:\\s+|$)`, "i"),
  ];
}

export interface RequestedRuntimeDirective {
  requestedRuntimeId: string;
  runtimeScope: Exclude<RuntimeScope, "none">;
}

export function parseRequestedRuntimeDirective(text: string, availableRuntimeIds: string[]): RequestedRuntimeDirective | null {
  const normalizedRuntimeIds = availableRuntimeIds
    .filter((runtimeId) => RUNTIME_ID_PATTERN.test(runtimeId))
    .sort((a, b) => b.length - a.length);

  for (const runtimeId of normalizedRuntimeIds) {
    for (const pattern of buildSessionPatterns(runtimeId)) {
      if (pattern.test(text)) {
        return {
          requestedRuntimeId: runtimeId,
          runtimeScope: "session",
        };
      }
    }
  }

  for (const runtimeId of normalizedRuntimeIds) {
    for (const pattern of buildTurnPatterns(runtimeId)) {
      if (pattern.test(text)) {
        return {
          requestedRuntimeId: runtimeId,
          runtimeScope: "turn",
        };
      }
    }
  }

  return null;
}

export function parseRequestedRuntime(text: string, availableRuntimeIds: string[]): string | null {
  return parseRequestedRuntimeDirective(text, availableRuntimeIds)?.requestedRuntimeId ?? null;
}

export interface ResolveExecutionRuntimeInput {
  requestedRuntimeId: string | null;
  runtimeScope: RuntimeScope;
  originRuntimeId: string;
  currentRuntimeId: string | null;
  availableRuntimeIds: string[];
}

export function resolveExecutionRuntime(input: ResolveExecutionRuntimeInput): RuntimeResolution {
  if (input.requestedRuntimeId) {
    return {
      executionRuntimeId: input.requestedRuntimeId,
      requestedRuntimeId: input.requestedRuntimeId,
      runtimeScope: input.runtimeScope,
      persistedCurrentRuntimeId:
        input.runtimeScope === "session"
          ? input.requestedRuntimeId
          : input.runtimeScope === "turn"
            ? input.currentRuntimeId
            : input.currentRuntimeId ?? input.requestedRuntimeId,
      source: "explicit",
    };
  }

  if (input.currentRuntimeId) {
    return {
      executionRuntimeId: input.currentRuntimeId,
      requestedRuntimeId: null,
      runtimeScope: input.runtimeScope,
      persistedCurrentRuntimeId: input.currentRuntimeId,
      source: "current",
    };
  }

  if (input.availableRuntimeIds.includes(input.originRuntimeId)) {
    return {
      executionRuntimeId: input.originRuntimeId,
      requestedRuntimeId: null,
      runtimeScope: input.runtimeScope,
      persistedCurrentRuntimeId: input.runtimeScope === "none" ? input.originRuntimeId : null,
      source: "origin",
    };
  }

  throw new Error("No execution runtime available for submitted turn");
}
