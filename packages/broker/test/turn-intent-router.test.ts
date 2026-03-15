import { describe, expect, it, vi } from "vitest";
import type { RuntimeModelState } from "@advaita/shared";
import {
  FallbackTurnIntentRouter,
  HeuristicTurnIntentRouter,
  OpenAITurnIntentRouter,
  createTurnIntentRouter,
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

describe("turn intent routers", () => {
  it("heuristic router distinguishes sticky switches from one-turn routing", async () => {
    const router = new HeuristicTurnIntentRouter();
    await expect(router.routeTurn(routerInput)).resolves.toEqual({
      action: "execute",
      requestedRuntimeId: "linux",
      runtimeScope: "session",
      requestedModelQuery: "gpt 5",
      executionText: "inspect the build logs using gpt 5",
      routingSource: "heuristic",
    });
  });

  it("parses structured openai router output", async () => {
    const fetchImpl = vi.fn<typeof fetch>().mockResolvedValue({
      ok: true,
      json: async () => ({
        output_text: JSON.stringify({
          action: "execute",
          requestedRuntimeId: "linux",
          runtimeScope: "session",
          requestedModelQuery: "gpt 5",
          executionText: "inspect the build logs",
          routingSource: "llm",
        }),
      }),
    } as Response);

    const router = new OpenAITurnIntentRouter({
      apiKey: "test-key",
      model: "gpt-5.1-codex-mini",
      fetchImpl,
    });

    await expect(router.routeTurn(routerInput)).resolves.toEqual({
      action: "execute",
      requestedRuntimeId: "linux",
      runtimeScope: "session",
      requestedModelQuery: "gpt 5",
      executionText: "inspect the build logs",
      routingSource: "llm",
    });
  });

  it("falls back to heuristic routing when the llm router fails", async () => {
    const fetchImpl = vi.fn<typeof fetch>().mockResolvedValue({
      ok: false,
      status: 500,
      statusText: "boom",
      text: async () => "router exploded",
    } as Response);

    const router = new FallbackTurnIntentRouter(
      new OpenAITurnIntentRouter({
        apiKey: "test-key",
        model: "gpt-5.1-codex-mini",
        fetchImpl,
      }),
      new HeuristicTurnIntentRouter(),
    );

    await expect(router.routeTurn(routerInput)).resolves.toEqual({
      action: "execute",
      requestedRuntimeId: "linux",
      runtimeScope: "session",
      requestedModelQuery: "gpt 5",
      executionText: "inspect the build logs using gpt 5",
      routingSource: "heuristic",
    });
  });

  it("uses heuristic routing automatically when no router api key is configured", async () => {
    const router = createTurnIntentRouter({
      ADVAITA_ROUTER_MODE: "auto",
      ADVAITA_ROUTER_MODEL: "gpt-5.1-codex-mini",
    });

    await expect(router.routeTurn(routerInput)).resolves.toEqual({
      action: "execute",
      requestedRuntimeId: "linux",
      runtimeScope: "session",
      requestedModelQuery: "gpt 5",
      executionText: "inspect the build logs using gpt 5",
      routingSource: "heuristic",
    });
  });
});
