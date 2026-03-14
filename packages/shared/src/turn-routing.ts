import { extractRequestedModelQuery } from "./model-routing.js";
import { parseRequestedRuntime, resolveExecutionRuntime, type ResolveExecutionRuntimeInput } from "./runtime-routing.js";
import type { RuntimeResolution, TurnRoutingIntent } from "./types.js";

export function extractTurnRoutingIntent(text: string, availableRuntimeIds: string[]): TurnRoutingIntent {
  return {
    requestedRuntimeId: parseRequestedRuntime(text, availableRuntimeIds),
    requestedModelQuery: extractRequestedModelQuery(text),
  };
}

export interface ResolveTurnRoutingInput extends ResolveExecutionRuntimeInput {}

export interface ResolvedTurnRouting extends RuntimeResolution {
  requestedModelQuery: string | null;
}

export function resolveTurnRouting(input: ResolveTurnRoutingInput): ResolvedTurnRouting {
  return {
    ...resolveExecutionRuntime(input),
    requestedModelQuery: extractRequestedModelQuery(input.text),
  };
}
