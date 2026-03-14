import { describe, expect, it } from "vitest";
import { resolveModelQuery } from "../src/model-resolution.js";

const models = [
  { provider: "openai", id: "gpt-4", name: "GPT-4", reasoning: false, input: ["text"], cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 }, contextWindow: 1, maxTokens: 1 },
  { provider: "openai", id: "gpt-5", name: "GPT-5", reasoning: true, input: ["text"], cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 }, contextWindow: 1, maxTokens: 1 },
  { provider: "anthropic", id: "claude-sonnet-4-5", name: "Claude Sonnet 4.5", reasoning: true, input: ["text"], cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 }, contextWindow: 1, maxTokens: 1 },
] as any[];

describe("resolveModelQuery", () => {
  it("matches natural-language aliases", () => {
    expect(resolveModelQuery("gpt 5", models)?.id).toBe("gpt-5");
    expect(resolveModelQuery("claude sonnet 4.5", models)?.id).toBe("claude-sonnet-4-5");
  });

  it("matches provider/id formats", () => {
    expect(resolveModelQuery("openai/gpt-4", models)?.id).toBe("gpt-4");
  });
});
