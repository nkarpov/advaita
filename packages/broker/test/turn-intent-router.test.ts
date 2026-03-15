import { describe, expect, it } from "vitest";
import type { Model } from "@mariozechner/pi-ai";
import type { RuntimeModelState } from "@advaita/shared";
import {
  FallbackTurnIntentRouter,
  HeuristicTurnIntentRouter,
  PiTurnIntentRouter,
  createTurnIntentRouter,
  inspectTurnIntentRouterEnvironment,
  type RouterAuthStorageLike,
  type RouterModelRegistryLike,
} from "../src/turn-intent-router.js";

function createModelState(currentModel: RuntimeModelState["currentModel"]): RuntimeModelState {
  return {
    currentModel,
    availableModels: [
      { provider: "openai", modelId: "gpt-4", name: "GPT-4" },
      { provider: "openai", modelId: "gpt-5", name: "GPT-5" },
    ],
    thinkingLevel: "off",
  };
}

const routerInput = {
  text: "switch to linux and inspect the build logs using gpt 5",
  originRuntimeId: "mac",
  currentRuntimeId: "mac",
  runtimes: [
    {
      runtimeId: "mac",
      displayName: "Mac",
      cwd: "/Users/nickkarpov/advaita",
      modelState: createModelState({ provider: "openai", modelId: "gpt-4", name: "GPT-4" }),
    },
    {
      runtimeId: "linux",
      displayName: "Linux",
      cwd: "/home/nick/advaita",
      modelState: createModelState({ provider: "openai", modelId: "gpt-4", name: "GPT-4" }),
    },
  ],
};

const routerModel: Model<any> = {
  id: "gpt-5.1-codex-mini",
  name: "GPT-5.1 Codex mini",
  api: "openai-responses",
  provider: "openai",
  baseUrl: "https://api.openai.com/v1",
  reasoning: true,
  input: ["text"],
  cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
  contextWindow: 1,
  maxTokens: 1,
};

function createRouterResources(availableModels: Model<any>[]): {
  authStorage: RouterAuthStorageLike;
  modelRegistry: RouterModelRegistryLike;
} {
  return {
    authStorage: {
      reload() {
        // noop
      },
    },
    modelRegistry: {
      refresh() {
        // noop
      },
      getAvailable() {
        return availableModels;
      },
      async getApiKey() {
        return "test-key";
      },
      getError() {
        return undefined;
      },
    },
  };
}

describe("turn intent routers", () => {
  it("heuristic router distinguishes sticky switches from one-turn routing", async () => {
    const router = new HeuristicTurnIntentRouter();
    await expect(router.routeTurn(routerInput)).resolves.toEqual({
      action: "execute",
      requestedRuntimeId: "linux",
      runtimeScope: "session",
      requestedModelQuery: "gpt 5",
      executionText: "switch to linux and inspect the build logs using gpt 5",
      routingSource: "heuristic",
    });
  });

  it("uses Pi model/auth plumbing to classify routing with a tool call", async () => {
    const { authStorage, modelRegistry } = createRouterResources([routerModel]);
    const router = new PiTurnIntentRouter({
      modelQuery: "gpt-5.1-codex-mini",
      authStorage,
      modelRegistry,
      completeSimpleImpl: async () => ({
        role: "assistant",
        api: "openai-responses",
        provider: "openai",
        model: "gpt-5.1-codex-mini",
        stopReason: "toolUse",
        usage: {
          input: 0,
          output: 0,
          cacheRead: 0,
          cacheWrite: 0,
          totalTokens: 0,
          cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 },
        },
        timestamp: 1,
        content: [
          {
            type: "toolCall",
            id: "tool-1",
            name: "route_turn",
            arguments: {
              action: "execute",
              requestedRuntimeId: "linux",
              runtimeScope: "session",
              requestedModelQuery: "gpt 5",
              executionText: "inspect the build logs",
              routingSource: "llm",
            },
          },
        ],
      }),
    });

    await expect(router.routeTurn(routerInput)).resolves.toEqual({
      action: "execute",
      requestedRuntimeId: "linux",
      runtimeScope: "session",
      requestedModelQuery: "gpt 5",
      executionText: "switch to linux and inspect the build logs using gpt 5",
      routingSource: "llm",
    });
  });

  it("falls back to heuristic routing when the pi-backed router fails", async () => {
    const { authStorage, modelRegistry } = createRouterResources([routerModel]);
    const router = new FallbackTurnIntentRouter(
      new PiTurnIntentRouter({
        modelQuery: "gpt-5.1-codex-mini",
        authStorage,
        modelRegistry,
        completeSimpleImpl: async () => ({
          role: "assistant",
          api: "openai-responses",
          provider: "openai",
          model: "gpt-5.1-codex-mini",
          stopReason: "error",
          errorMessage: "router exploded",
          usage: {
            input: 0,
            output: 0,
            cacheRead: 0,
            cacheWrite: 0,
            totalTokens: 0,
            cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 },
          },
          timestamp: 1,
          content: [],
        }),
      }),
      new HeuristicTurnIntentRouter(),
    );

    await expect(router.routeTurn(routerInput)).resolves.toEqual({
      action: "execute",
      requestedRuntimeId: "linux",
      runtimeScope: "session",
      requestedModelQuery: "gpt 5",
      executionText: "switch to linux and inspect the build logs using gpt 5",
      routingSource: "heuristic",
    });
  });

  it("inspects router availability through local Pi model/auth state", async () => {
    const inspection = await inspectTurnIntentRouterEnvironment(
      {
        ADVAITA_ROUTER_MODE: "auto",
        ADVAITA_ROUTER_MODEL: "gpt-5.1-codex-mini",
      },
      createRouterResources([routerModel]),
    );

    expect(inspection.status).toBe("ok");
    expect(inspection.selectedModelId).toBe("openai/gpt-5.1-codex-mini");
    expect(inspection.detail).toContain("pi:openai/gpt-5.1-codex-mini");
  });

  it("normalizes local aliases to the origin runtime", async () => {
    const router = new HeuristicTurnIntentRouter();
    await expect(router.routeTurn({ ...routerInput, text: "switch to local" })).resolves.toEqual({
      action: "switch_runtime",
      requestedRuntimeId: "mac",
      runtimeScope: "session",
      requestedModelQuery: null,
      executionText: null,
      routingSource: "heuristic",
    });
  });

  it("uses heuristic routing automatically when no Pi-authenticated router model is available", async () => {
    const router = createTurnIntentRouter({
      ADVAITA_ROUTER_MODE: "heuristic",
      ADVAITA_ROUTER_MODEL: "gpt-5.1-codex-mini",
    });

    await expect(router.routeTurn(routerInput)).resolves.toEqual({
      action: "execute",
      requestedRuntimeId: "linux",
      runtimeScope: "session",
      requestedModelQuery: "gpt 5",
      executionText: "switch to linux and inspect the build logs using gpt 5",
      routingSource: "heuristic",
    });
  });
});
