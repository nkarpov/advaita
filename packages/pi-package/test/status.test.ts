import { describe, expect, it } from "vitest";
import { formatFooterStatus } from "../src/status.js";

describe("formatFooterStatus", () => {
  it("renders disconnected state", () => {
    expect(
      formatFooterStatus({
        connected: false,
        sessionName: null,
        runtimeId: "mac",
        queuedCount: 0,
        currentRuntimeId: null,
        activeTurnId: null,
        executorRuntimeId: null,
        executorClientId: null,
        executionCwd: null,
        presence: [],
      }),
    ).toContain("off • mac");
  });

  it("renders connected state with executor and peers", () => {
    const text = formatFooterStatus({
      connected: true,
      sessionName: "demo",
      runtimeId: "mac",
      queuedCount: 2,
      currentRuntimeId: "linux",
      activeTurnId: "turn-1",
      executorRuntimeId: "linux",
      executorClientId: "client-linux",
      executionCwd: "/home/nick/advaita",
      presence: [
        {
          clientId: "client-mac",
          runtimeId: "mac",
          displayName: "Mac",
          cwd: "/Users/nickkarpov/advaita",
          connectedAt: "t1",
          lastSeenAt: "t2",
          typing: false,
          executing: false,
          modelState: {
            currentModel: { provider: "openai", modelId: "gpt-4", name: "GPT-4" },
            availableModels: [],
            thinkingLevel: "off",
          },
        },
        {
          clientId: "client-linux",
          runtimeId: "linux",
          displayName: "Linux",
          cwd: "/home/nick/advaita",
          connectedAt: "t1",
          lastSeenAt: "t2",
          typing: true,
          executing: true,
          modelState: {
            currentModel: { provider: "openai", modelId: "gpt-5", name: "GPT-5" },
            availableModels: [],
            thinkingLevel: "off",
          },
        },
      ],
    });

    expect(text).toContain("session=demo");
    expect(text).toContain("queue=2");
    expect(text).toContain("exec=linux@client-linux:/home/nick/advaita");
    expect(text).toContain("linux:gpt-5(exec,typing)");
  });
});
