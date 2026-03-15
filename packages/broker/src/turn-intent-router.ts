import { extractTurnRoutingIntent, type RuntimeModelState, type TurnRoutingIntent } from "@advaita/shared";

export interface TurnIntentRouterRuntime {
  runtimeId: string;
  displayName: string;
  cwd: string;
  modelState: RuntimeModelState;
}

export interface TurnIntentRouterInput {
  text: string;
  originRuntimeId: string;
  currentRuntimeId: string | null;
  runtimes: TurnIntentRouterRuntime[];
}

export interface TurnIntentRouter {
  routeTurn(input: TurnIntentRouterInput): Promise<TurnRoutingIntent>;
}

export interface OpenAITurnIntentRouterOptions {
  apiKey: string;
  model: string;
  baseUrl?: string;
  fetchImpl?: typeof fetch;
}

export interface TurnIntentRouterEnvironment {
  mode: "auto" | "heuristic" | "openai";
  model: string;
  baseUrl: string;
  apiKey?: string;
}

const DEFAULT_OPENAI_BASE_URL = "https://api.openai.com/v1";
const DEFAULT_OPENAI_ROUTER_MODEL = "gpt-5.1-codex-mini";

const TURN_ROUTING_RESPONSE_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["action", "requestedRuntimeId", "runtimeScope", "requestedModelQuery", "executionText", "routingSource"],
  properties: {
    action: { type: "string", enum: ["execute", "switch_runtime"] },
    requestedRuntimeId: { type: ["string", "null"] },
    runtimeScope: { type: "string", enum: ["none", "turn", "session"] },
    requestedModelQuery: { type: ["string", "null"] },
    executionText: { type: ["string", "null"] },
    routingSource: { type: "string", enum: ["llm"] },
  },
} as const;

const ROUTER_SYSTEM_PROMPT = [
  "You are Advaita's routing classifier for a multiplayer coding agent.",
  "Return only JSON matching the requested schema.",
  "",
  "Decide whether the user wants a normal executed turn or a sticky shared runtime switch.",
  "Rules:",
  "- runtimeScope=session means an explicit sticky runtime switch such as 'switch to linux', 'from now on use linux', 'stay on linux'.",
  "- runtimeScope=turn means a one-turn routing override such as 'run this on linux', 'have mac do this one', 'route this to linux'.",
  "- runtimeScope=none means there is no explicit runtime request in the text.",
  "- action=switch_runtime only when the message is purely a sticky runtime switch and there is no remaining coding task to execute.",
  "- action=execute for all coding turns, including turns that also change the sticky runtime.",
  "- requestedRuntimeId must be one of the provided runtime IDs or null.",
  "- Extract requestedModelQuery only from the user's words. Do not invent provider/model IDs.",
  "- executionText should contain only the coding task to run, with routing chatter removed when possible.",
  "- If the message is only a runtime switch, set executionText to null.",
  "- If unsure about the runtime, leave requestedRuntimeId null and runtimeScope=none.",
  "- Never invent runtime IDs, models, or tasks.",
  "- Always set routingSource to 'llm'.",
].join("\n");

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function resolveResponsesUrl(baseUrl: string): string {
  const normalized = baseUrl.replace(/\/+$/, "");
  if (normalized.endsWith("/responses")) return normalized;
  if (normalized.endsWith("/v1")) return `${normalized}/responses`;
  return `${normalized}/v1/responses`;
}

function stripMarkdownCodeFence(text: string): string {
  const trimmed = text.trim();
  const fenced = trimmed.match(/^```(?:json)?\s*([\s\S]+?)\s*```$/i);
  return fenced?.[1]?.trim() ?? trimmed;
}

function extractResponseText(payload: unknown): string {
  if (!isRecord(payload)) {
    throw new Error("OpenAI router response was not an object");
  }

  const direct = payload.output_text;
  if (typeof direct === "string" && direct.trim().length > 0) {
    return direct;
  }

  const output = payload.output;
  if (!Array.isArray(output)) {
    throw new Error("OpenAI router response did not include output_text");
  }

  for (const item of output) {
    if (!isRecord(item) || !Array.isArray(item.content)) continue;
    for (const part of item.content) {
      if (!isRecord(part)) continue;
      if (typeof part.text === "string" && part.text.trim().length > 0) {
        return part.text;
      }
    }
  }

  throw new Error("OpenAI router response did not include a text payload");
}

function formatModelRef(model: RuntimeModelState["currentModel"]): string | null {
  if (!model) return null;
  return `${model.provider}/${model.modelId}`;
}

function normalizeRequestedRuntimeId(requestedRuntimeId: string | null, runtimes: TurnIntentRouterRuntime[]): string | null {
  if (!requestedRuntimeId) return null;
  const direct = runtimes.find((runtime) => runtime.runtimeId === requestedRuntimeId);
  if (direct) return direct.runtimeId;
  const folded = requestedRuntimeId.toLowerCase();
  return runtimes.find((runtime) => runtime.runtimeId.toLowerCase() === folded)?.runtimeId ?? null;
}

function coerceString(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function validateRouterPayload(payload: unknown, runtimes: TurnIntentRouterRuntime[]): TurnRoutingIntent {
  if (!isRecord(payload)) {
    throw new Error("Router payload was not an object");
  }

  const action = payload.action;
  const runtimeScope = payload.runtimeScope;
  const routingSource = payload.routingSource;
  if (action !== "execute" && action !== "switch_runtime") {
    throw new Error(`Router returned invalid action: ${String(action)}`);
  }
  if (runtimeScope !== "none" && runtimeScope !== "turn" && runtimeScope !== "session") {
    throw new Error(`Router returned invalid runtimeScope: ${String(runtimeScope)}`);
  }
  if (routingSource !== "llm") {
    throw new Error(`Router returned invalid routingSource: ${String(routingSource)}`);
  }

  const requestedRuntimeId = normalizeRequestedRuntimeId(coerceString(payload.requestedRuntimeId), runtimes);
  const requestedModelQuery = coerceString(payload.requestedModelQuery);
  const executionText = coerceString(payload.executionText);

  if (requestedRuntimeId === null && payload.requestedRuntimeId !== null && payload.requestedRuntimeId !== undefined) {
    throw new Error(`Router returned unknown runtimeId: ${String(payload.requestedRuntimeId)}`);
  }

  if (requestedRuntimeId === null && runtimeScope !== "none") {
    throw new Error("Router returned a runtime scope without a runtime id");
  }

  if (requestedRuntimeId !== null && runtimeScope === "none") {
    throw new Error("Router returned a runtime id with runtimeScope=none");
  }

  if (action === "switch_runtime") {
    if (runtimeScope !== "session") {
      throw new Error("Router returned switch_runtime without runtimeScope=session");
    }
    if (!requestedRuntimeId) {
      throw new Error("Router returned switch_runtime without a runtime id");
    }
    if (executionText !== null) {
      throw new Error("Router returned switch_runtime with executionText");
    }
  }

  if (action === "execute" && !executionText) {
    throw new Error("Router returned execute without executionText");
  }

  return {
    action,
    requestedRuntimeId,
    runtimeScope,
    requestedModelQuery,
    executionText,
    routingSource: "llm",
  };
}

function buildRouterPrompt(input: TurnIntentRouterInput): string {
  return JSON.stringify(
    {
      text: input.text,
      originRuntimeId: input.originRuntimeId,
      currentRuntimeId: input.currentRuntimeId,
      runtimes: input.runtimes.map((runtime) => ({
        runtimeId: runtime.runtimeId,
        displayName: runtime.displayName,
        cwd: runtime.cwd,
        currentModel: formatModelRef(runtime.modelState.currentModel),
        availableModels: runtime.modelState.availableModels.map((model) => `${model.provider}/${model.modelId}`),
      })),
      examples: [
        {
          user: "switch to linux",
          output: {
            action: "switch_runtime",
            requestedRuntimeId: "linux",
            runtimeScope: "session",
            requestedModelQuery: null,
            executionText: null,
            routingSource: "llm",
          },
        },
        {
          user: "switch to linux and inspect the build logs using gpt 5",
          output: {
            action: "execute",
            requestedRuntimeId: "linux",
            runtimeScope: "session",
            requestedModelQuery: "gpt 5",
            executionText: "inspect the build logs",
            routingSource: "llm",
          },
        },
        {
          user: "run this on mac using claude sonnet 4.5",
          output: {
            action: "execute",
            requestedRuntimeId: "mac",
            runtimeScope: "turn",
            requestedModelQuery: "claude sonnet 4.5",
            executionText: "run this",
            routingSource: "llm",
          },
        },
      ],
    },
    null,
    2,
  );
}

export class HeuristicTurnIntentRouter implements TurnIntentRouter {
  async routeTurn(input: TurnIntentRouterInput): Promise<TurnRoutingIntent> {
    return extractTurnRoutingIntent(
      input.text,
      input.runtimes.map((runtime) => runtime.runtimeId),
    );
  }
}

export class OpenAITurnIntentRouter implements TurnIntentRouter {
  private readonly fetchImpl: typeof fetch;
  private readonly responsesUrl: string;

  constructor(private readonly options: OpenAITurnIntentRouterOptions) {
    this.fetchImpl = options.fetchImpl ?? fetch;
    this.responsesUrl = resolveResponsesUrl(options.baseUrl ?? DEFAULT_OPENAI_BASE_URL);
  }

  async routeTurn(input: TurnIntentRouterInput): Promise<TurnRoutingIntent> {
    const response = await this.fetchImpl(this.responsesUrl, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${this.options.apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: this.options.model,
        store: false,
        temperature: 0,
        max_output_tokens: 300,
        instructions: ROUTER_SYSTEM_PROMPT,
        input: [
          {
            role: "user",
            content: [{ type: "input_text", text: buildRouterPrompt(input) }],
          },
        ],
        text: {
          verbosity: "low",
          format: {
            type: "json_schema",
            name: "advaita_turn_routing",
            strict: true,
            schema: TURN_ROUTING_RESPONSE_SCHEMA,
          },
        },
      }),
    });

    if (!response.ok) {
      const detail = await response.text().catch(() => "");
      throw new Error(`OpenAI router request failed (${response.status}): ${detail.trim() || response.statusText}`);
    }

    const payload = await response.json();
    const text = stripMarkdownCodeFence(extractResponseText(payload));
    const parsed = JSON.parse(text) as unknown;
    return validateRouterPayload(parsed, input.runtimes);
  }
}

export class FallbackTurnIntentRouter implements TurnIntentRouter {
  private warned = false;

  constructor(
    private readonly primary: TurnIntentRouter,
    private readonly fallback: TurnIntentRouter,
  ) {}

  async routeTurn(input: TurnIntentRouterInput): Promise<TurnRoutingIntent> {
    try {
      return await this.primary.routeTurn(input);
    } catch (error) {
      if (!this.warned) {
        const message = error instanceof Error ? error.message : String(error);
        console.warn(`[advaita-router] Falling back to heuristic routing: ${message}`);
        this.warned = true;
      }
      return await this.fallback.routeTurn(input);
    }
  }
}

export function resolveTurnIntentRouterEnvironment(env: NodeJS.ProcessEnv = process.env): TurnIntentRouterEnvironment {
  const rawMode = env.ADVAITA_ROUTER_MODE?.trim().toLowerCase();
  const mode = rawMode === "heuristic" || rawMode === "openai" ? rawMode : "auto";
  return {
    mode,
    model: env.ADVAITA_ROUTER_MODEL?.trim() || DEFAULT_OPENAI_ROUTER_MODEL,
    baseUrl: env.ADVAITA_ROUTER_BASE_URL?.trim() || env.OPENAI_BASE_URL?.trim() || DEFAULT_OPENAI_BASE_URL,
    apiKey: env.ADVAITA_ROUTER_OPENAI_API_KEY?.trim() || env.OPENAI_API_KEY?.trim() || undefined,
  };
}

export function describeTurnIntentRouterEnvironment(env: NodeJS.ProcessEnv = process.env): string {
  const config = resolveTurnIntentRouterEnvironment(env);
  if (config.mode === "heuristic") {
    return "heuristic";
  }
  if (!config.apiKey) {
    return `heuristic (set OPENAI_API_KEY or ADVAITA_ROUTER_OPENAI_API_KEY to enable ${config.model})`;
  }
  return `openai:${config.model} with heuristic fallback`;
}

export function createTurnIntentRouter(
  env: NodeJS.ProcessEnv = process.env,
  fetchImpl?: typeof fetch,
): TurnIntentRouter {
  const config = resolveTurnIntentRouterEnvironment(env);
  const heuristic = new HeuristicTurnIntentRouter();

  if (config.mode === "heuristic") {
    return heuristic;
  }

  if (!config.apiKey) {
    return heuristic;
  }

  const openai = new OpenAITurnIntentRouter({
    apiKey: config.apiKey,
    model: config.model,
    baseUrl: config.baseUrl,
    fetchImpl,
  });

  if (config.mode === "openai") {
    return new FallbackTurnIntentRouter(openai, heuristic);
  }

  return new FallbackTurnIntentRouter(openai, heuristic);
}
