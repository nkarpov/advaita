import { z } from "zod";
import type { RuntimeResolution, SubmittedTurn, TurnRoutingAction, TurnRoutingIntent, TurnRoutingSource } from "./types.js";
import { extractRequestedModelQuery } from "./model-routing.js";
import { parseRequestedRuntimeDirective, resolveExecutionRuntime } from "./runtime-routing.js";

const turnRoutingActionSchema = z.enum(["execute", "switch_runtime"] satisfies [TurnRoutingAction, ...TurnRoutingAction[]]);
const turnRoutingSourceSchema = z.enum(["heuristic", "llm", "command"] satisfies [TurnRoutingSource, ...TurnRoutingSource[]]);
const runtimeScopeSchema = z.enum(["none", "turn", "session"] as const);

export const turnRoutingIntentSchema: z.ZodType<TurnRoutingIntent> = z.object({
  action: turnRoutingActionSchema,
  requestedRuntimeId: z.string().nullable(),
  runtimeScope: runtimeScopeSchema,
  requestedModelQuery: z.string().nullable(),
  executionText: z.string().nullable(),
  routingSource: turnRoutingSourceSchema,
});

function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function stripLeadingSessionRuntimeDirective(text: string, runtimeId: string): string | null {
  const escapedRuntimeId = escapeRegex(runtimeId);
  const originRelative = "(?:local|here|(?:this|my)\\s+machine)";
  const patterns = [
    new RegExp(`^\\s*(?:ok(?:ay)?\\s+)?(?:switch|move)\\s+(?:this\\s+)?(?:to|onto|over\\s+to)\\s+${escapedRuntimeId}\\s*(?:[,;]|(?:and|then)\\s+)?`, "i"),
    new RegExp(`^\\s*(?:ok(?:ay)?\\s+)?(?:stay|keep(?:\\s+working)?|from\\s+now\\s+on\\s+use)\\s+(?:on|in)?\\s*${escapedRuntimeId}\\s*(?:[,;]|(?:and|then)\\s+)?`, "i"),
    new RegExp(`^\\s*(?:ok(?:ay)?\\s+)?(?:you(?:'| a)?re|ur)\\s+(?:now\\s+)?(?:on|in)\\s+${escapedRuntimeId}\\s*(?:[,;]|(?:and|then)\\s+)?`, "i"),
    new RegExp(`^\\s*\\/runtime\\s+${escapedRuntimeId}\\s*(?:[,;]|(?:and|then)\\s+)?`, "i"),
    new RegExp(`^\\s*(?:ok(?:ay)?\\s+)?(?:switch|move)\\s+(?:this\\s+)?(?:to|onto|over\\s+to)\\s+${originRelative}\\s*(?:[,;]|(?:and|then)\\s+)?`, "i"),
    new RegExp(`^\\s*(?:ok(?:ay)?\\s+)?(?:stay|keep(?:\\s+working)?|from\\s+now\\s+on\\s+use)\\s+(?:on|in)?\\s*${originRelative}\\s*(?:[,;]|(?:and|then)\\s+)?`, "i"),
    new RegExp(`^\\s*(?:ok(?:ay)?\\s+)?(?:you(?:'| a)?re|ur)\\s+(?:now\\s+)?(?:on|in)\\s+${originRelative}\\s*(?:[,;]|(?:and|then)\\s+)?`, "i"),
    new RegExp(`^\\s*\\/runtime\\s+local\\s*(?:[,;]|(?:and|then)\\s+)?`, "i"),
  ];

  for (const pattern of patterns) {
    const stripped = text.replace(pattern, "").trim();
    if (stripped !== text.trim()) {
      return stripped.length > 0 ? stripped : null;
    }
  }

  return text.trim();
}

export function parseTurnRoutingIntent(raw: unknown): TurnRoutingIntent {
  return turnRoutingIntentSchema.parse(raw);
}

export function parseTurnRoutingIntentJson(raw: string): TurnRoutingIntent {
  return turnRoutingIntentSchema.parse(JSON.parse(raw));
}

export function extractTurnRoutingIntent(
  text: string,
  availableRuntimeIds: string[],
  originRuntimeId?: string,
): TurnRoutingIntent {
  const trimmed = text.trim();
  const runtimeDirective = parseRequestedRuntimeDirective(trimmed, availableRuntimeIds, originRuntimeId);
  const requestedModelQuery = extractRequestedModelQuery(trimmed);

  if (!runtimeDirective) {
    return {
      action: "execute",
      requestedRuntimeId: null,
      runtimeScope: "none",
      requestedModelQuery,
      executionText: trimmed,
      routingSource: "heuristic",
    };
  }

  if (runtimeDirective.runtimeScope === "session") {
    const executionText = stripLeadingSessionRuntimeDirective(trimmed, runtimeDirective.requestedRuntimeId);
    if (!executionText) {
      return {
        action: "switch_runtime",
        requestedRuntimeId: runtimeDirective.requestedRuntimeId,
        runtimeScope: "session",
        requestedModelQuery,
        executionText: null,
        routingSource: "heuristic",
      };
    }

    return {
      action: "execute",
      requestedRuntimeId: runtimeDirective.requestedRuntimeId,
      runtimeScope: "session",
      requestedModelQuery,
      executionText: trimmed,
      routingSource: "heuristic",
    };
  }

  return {
    action: "execute",
    requestedRuntimeId: runtimeDirective.requestedRuntimeId,
    runtimeScope: runtimeDirective.runtimeScope,
    requestedModelQuery,
    executionText: trimmed,
    routingSource: "heuristic",
  };
}

export interface ResolveTurnRoutingInput {
  requestedRuntimeId: SubmittedTurn["requestedRuntimeId"];
  runtimeScope: SubmittedTurn["runtimeScope"];
  requestedModelQuery: SubmittedTurn["requestedModelQuery"];
  executionText: SubmittedTurn["executionText"];
  routingSource: SubmittedTurn["routingSource"];
  originRuntimeId: string;
  currentRuntimeId: string | null;
  availableRuntimeIds: string[];
}

export interface ResolvedTurnRouting extends RuntimeResolution {
  requestedModelQuery: string | null;
  executionText: string;
  routingSource: TurnRoutingSource;
}

export function resolveTurnRouting(input: ResolveTurnRoutingInput): ResolvedTurnRouting {
  return {
    ...resolveExecutionRuntime({
      requestedRuntimeId: input.requestedRuntimeId,
      runtimeScope: input.runtimeScope,
      originRuntimeId: input.originRuntimeId,
      currentRuntimeId: input.currentRuntimeId,
      availableRuntimeIds: input.availableRuntimeIds,
    }),
    requestedModelQuery: input.requestedModelQuery,
    executionText: input.executionText,
    routingSource: input.routingSource,
  };
}
