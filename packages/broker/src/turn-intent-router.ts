import {
  AuthStorage,
  ModelRegistry,
} from "@mariozechner/pi-coding-agent";
import {
  completeSimple,
  StringEnum,
  Type,
  type Api,
  type AssistantMessage,
  type Model,
  type Tool,
} from "@mariozechner/pi-ai";
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

export interface TurnIntentRouterEnvironment {
  mode: "auto" | "heuristic" | "pi";
  modelQuery: string;
}

export interface TurnIntentRouterInspection {
  status: "ok" | "warn";
  detail: string;
  modelQuery: string;
  selectedModelId?: string;
}

export interface RouterAuthStorageLike {
  reload(): void;
}

export interface RouterModelRegistryLike {
  refresh(): void;
  getAvailable(): Model<Api>[];
  getApiKey(model: Model<Api>): Promise<string | undefined>;
  getError?(): string | undefined;
}

export interface PiTurnIntentRouterOptions {
  modelQuery: string;
  authStorage?: RouterAuthStorageLike;
  modelRegistry?: RouterModelRegistryLike;
  completeSimpleImpl?: typeof completeSimple;
}

const DEFAULT_ROUTER_MODEL_QUERY = "gpt-5.1-codex-mini";

const ROUTER_SYSTEM_PROMPT = [
  "You are Advaita's routing classifier for a multiplayer coding agent.",
  "Classify the user's turn by calling the route_turn tool exactly once.",
  "If your model absolutely cannot call tools, output only JSON with the same fields.",
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

const ROUTER_TOOL: Tool = {
  name: "route_turn",
  description: "Return the classified routing intent for the user turn. Call this tool exactly once instead of answering in prose.",
  parameters: Type.Object({
    action: StringEnum(["execute", "switch_runtime"] as const),
    requestedRuntimeId: Type.Union([Type.String(), Type.Null()]),
    runtimeScope: StringEnum(["none", "turn", "session"] as const),
    requestedModelQuery: Type.Union([Type.String(), Type.Null()]),
    executionText: Type.Union([Type.String(), Type.Null()]),
    routingSource: Type.Literal("llm"),
  }),
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
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

function stripMarkdownCodeFence(text: string): string {
  const trimmed = text.trim();
  const fenced = trimmed.match(/^```(?:json)?\s*([\s\S]+?)\s*```$/i);
  return fenced?.[1]?.trim() ?? trimmed;
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

function normalize(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function compact(text: string): string {
  return normalize(text).replace(/\s+/g, "");
}

function scoreAlias(query: string, alias: string): number {
  const normalizedQuery = normalize(query);
  const normalizedAlias = normalize(alias);
  const compactQuery = compact(query);
  const compactAlias = compact(alias);
  if (!normalizedQuery || !normalizedAlias) return 0;

  if (normalizedQuery === normalizedAlias) return 1000 - normalizedAlias.length;
  if (compactQuery === compactAlias) return 975 - compactAlias.length;
  if (normalizedAlias.startsWith(normalizedQuery)) return 900 - normalizedAlias.length;
  if (compactAlias.startsWith(compactQuery)) return 875 - compactAlias.length;
  if (normalizedQuery.includes(normalizedAlias)) return 800 - normalizedAlias.length;

  const queryTokens = new Set(normalizedQuery.split(" "));
  const aliasTokens = normalizedAlias.split(" ");
  const overlap = aliasTokens.filter((token) => queryTokens.has(token)).length;
  if (overlap === 0) return 0;

  const allAliasTokensMatch = aliasTokens.every((token) => queryTokens.has(token));
  return (allAliasTokensMatch ? 700 : 500) + overlap * 20 - normalizedAlias.length;
}

function aliasesForModel(model: Pick<Model<Api>, "provider" | "id" | "name">): string[] {
  const aliases = new Set<string>();
  aliases.add(model.id);
  aliases.add(`${model.provider}/${model.id}`);
  aliases.add(`${model.provider} ${model.id}`);
  if (model.name) {
    aliases.add(model.name);
    aliases.add(`${model.provider} ${model.name}`);
  }
  return Array.from(aliases);
}

function resolveModelQuery<TModel extends Pick<Model<Api>, "provider" | "id" | "name">>(query: string, models: TModel[]): TModel | undefined {
  let best: { model: TModel; score: number } | null = null;

  for (const model of models) {
    const bestAliasScore = Math.max(...aliasesForModel(model).map((alias) => scoreAlias(query, alias)), 0);
    if (bestAliasScore <= 0) continue;
    if (!best || bestAliasScore > best.score) {
      best = { model, score: bestAliasScore };
    }
  }

  return best?.model;
}

function createDefaultRouterResources(): { authStorage: RouterAuthStorageLike; modelRegistry: RouterModelRegistryLike } {
  const authStorage = AuthStorage.create();
  const modelRegistry = new ModelRegistry(authStorage);
  return { authStorage, modelRegistry };
}

function extractPayloadFromAssistantMessage(message: AssistantMessage): unknown {
  for (const block of message.content) {
    if (block.type === "toolCall" && block.name === ROUTER_TOOL.name) {
      return block.arguments;
    }
  }

  const textBlocks = message.content
    .filter((block): block is Extract<AssistantMessage["content"][number], { type: "text" }> => block.type === "text")
    .map((block) => block.text)
    .join("\n")
    .trim();

  if (textBlocks.length > 0) {
    return JSON.parse(stripMarkdownCodeFence(textBlocks));
  }

  throw new Error("Router model did not return a route_turn tool call or JSON payload");
}

async function resolveRouterModel(
  modelQuery: string,
  authStorage: RouterAuthStorageLike,
  modelRegistry: RouterModelRegistryLike,
): Promise<{ model: Model<Api>; apiKey: string }> {
  authStorage.reload();
  modelRegistry.refresh();

  const availableModels = modelRegistry.getAvailable();
  const model = resolveModelQuery(modelQuery, availableModels);
  if (!model) {
    throw new Error(`Router model query "${modelQuery}" is not available via local Pi auth/model config`);
  }

  const apiKey = await modelRegistry.getApiKey(model);
  if (!apiKey) {
    throw new Error(`Router model ${model.provider}/${model.id} is configured but no Pi API key/oauth token is available`);
  }

  return { model, apiKey };
}

export class HeuristicTurnIntentRouter implements TurnIntentRouter {
  async routeTurn(input: TurnIntentRouterInput): Promise<TurnRoutingIntent> {
    return extractTurnRoutingIntent(
      input.text,
      input.runtimes.map((runtime) => runtime.runtimeId),
    );
  }
}

export class PiTurnIntentRouter implements TurnIntentRouter {
  private readonly authStorage: RouterAuthStorageLike;
  private readonly modelRegistry: RouterModelRegistryLike;
  private readonly completeSimpleImpl: typeof completeSimple;

  constructor(private readonly options: PiTurnIntentRouterOptions) {
    const defaults = createDefaultRouterResources();
    this.authStorage = options.authStorage ?? defaults.authStorage;
    this.modelRegistry = options.modelRegistry ?? defaults.modelRegistry;
    this.completeSimpleImpl = options.completeSimpleImpl ?? completeSimple;
  }

  async routeTurn(input: TurnIntentRouterInput): Promise<TurnRoutingIntent> {
    const { model, apiKey } = await resolveRouterModel(this.options.modelQuery, this.authStorage, this.modelRegistry);

    const response = await this.completeSimpleImpl(
      model,
      {
        systemPrompt: ROUTER_SYSTEM_PROMPT,
        messages: [
          {
            role: "user",
            content: buildRouterPrompt(input),
            timestamp: Date.now(),
          },
        ],
        tools: [ROUTER_TOOL],
      },
      {
        apiKey,
        maxTokens: 300,
      },
    );

    if (response.stopReason === "error" || response.stopReason === "aborted") {
      throw new Error(response.errorMessage || `Router model ${model.provider}/${model.id} returned ${response.stopReason}`);
    }

    return validateRouterPayload(extractPayloadFromAssistantMessage(response), input.runtimes);
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
  const mode = rawMode === "heuristic" ? "heuristic" : rawMode === "pi" || rawMode === "openai" ? "pi" : "auto";
  return {
    mode,
    modelQuery: env.ADVAITA_ROUTER_MODEL_QUERY?.trim() || env.ADVAITA_ROUTER_MODEL?.trim() || DEFAULT_ROUTER_MODEL_QUERY,
  };
}

export async function inspectTurnIntentRouterEnvironment(
  env: NodeJS.ProcessEnv = process.env,
  options?: {
    authStorage?: RouterAuthStorageLike;
    modelRegistry?: RouterModelRegistryLike;
  },
): Promise<TurnIntentRouterInspection> {
  const config = resolveTurnIntentRouterEnvironment(env);
  if (config.mode === "heuristic") {
    return {
      status: "ok",
      detail: "heuristic (forced by ADVAITA_ROUTER_MODE=heuristic)",
      modelQuery: config.modelQuery,
    };
  }

  const defaults = createDefaultRouterResources();
  const authStorage = options?.authStorage ?? defaults.authStorage;
  const modelRegistry = options?.modelRegistry ?? defaults.modelRegistry;

  try {
    const { model } = await resolveRouterModel(config.modelQuery, authStorage, modelRegistry);
    return {
      status: "ok",
      detail: `pi:${model.provider}/${model.id} with heuristic fallback`,
      modelQuery: config.modelQuery,
      selectedModelId: `${model.provider}/${model.id}`,
    };
  } catch (error) {
    const registryError = modelRegistry.getError?.();
    const baseMessage = error instanceof Error ? error.message : String(error);
    return {
      status: "warn",
      detail: registryError
        ? `heuristic fallback (${baseMessage}; models.json warning: ${registryError})`
        : `heuristic fallback (${baseMessage})`,
      modelQuery: config.modelQuery,
    };
  }
}

export async function describeTurnIntentRouterEnvironment(env: NodeJS.ProcessEnv = process.env): Promise<string> {
  return (await inspectTurnIntentRouterEnvironment(env)).detail;
}

export function createTurnIntentRouter(env: NodeJS.ProcessEnv = process.env): TurnIntentRouter {
  const config = resolveTurnIntentRouterEnvironment(env);
  const heuristic = new HeuristicTurnIntentRouter();

  if (config.mode === "heuristic") {
    return heuristic;
  }

  return new FallbackTurnIntentRouter(
    new PiTurnIntentRouter({ modelQuery: config.modelQuery }),
    heuristic,
  );
}
