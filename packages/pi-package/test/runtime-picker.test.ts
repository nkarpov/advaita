import { describe, expect, it } from "vitest";
import { buildRuntimePickerOptions, getInitialRuntimePickerIndex } from "../src/runtime-picker.js";

describe("runtime picker helpers", () => {
  it("deduplicates by runtime id and prioritizes default then local runtime", () => {
    const options = buildRuntimePickerOptions({
      localRuntimeId: "linux",
      currentRuntimeId: "mac",
      executorRuntimeId: "mac",
      presence: [
        {
          clientId: "client-mac-a",
          runtimeId: "mac",
          displayName: "Mac A",
          cwd: "/Users/nickkarpov/advaita",
          connectedAt: "2026-03-14T00:00:00.000Z",
          lastSeenAt: "2026-03-14T00:00:00.000Z",
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
          connectedAt: "2026-03-14T00:00:00.000Z",
          lastSeenAt: "2026-03-14T00:00:02.000Z",
          typing: false,
          executing: false,
          modelState: {
            currentModel: { provider: "openai", modelId: "gpt-5", name: "GPT-5" },
            availableModels: [],
            thinkingLevel: "off",
          },
        },
        {
          clientId: "client-mac-b",
          runtimeId: "mac",
          displayName: "Mac B",
          cwd: "/Users/nickkarpov/advaita",
          connectedAt: "2026-03-14T00:00:00.000Z",
          lastSeenAt: "2026-03-14T00:00:03.000Z",
          typing: false,
          executing: true,
          modelState: {
            currentModel: { provider: "openai", modelId: "gpt-4", name: "GPT-4" },
            availableModels: [],
            thinkingLevel: "off",
          },
        },
      ],
    });

    expect(options).toEqual([
      {
        runtimeId: "mac",
        displayName: "Mac B",
        modelLabel: "GPT-4",
        isLocal: false,
        isDefault: true,
        isExecuting: true,
      },
      {
        runtimeId: "linux",
        displayName: "Linux",
        modelLabel: "GPT-5",
        isLocal: true,
        isDefault: false,
        isExecuting: false,
      },
    ]);
  });

  it("selects the default runtime first, otherwise the local runtime", () => {
    expect(
      getInitialRuntimePickerIndex([
        {
          runtimeId: "linux",
          displayName: "Linux",
          modelLabel: null,
          isLocal: true,
          isDefault: false,
          isExecuting: false,
        },
        {
          runtimeId: "mac",
          displayName: "Mac",
          modelLabel: null,
          isLocal: false,
          isDefault: true,
          isExecuting: false,
        },
      ]),
    ).toBe(1);

    expect(
      getInitialRuntimePickerIndex([
        {
          runtimeId: "linux",
          displayName: "Linux",
          modelLabel: null,
          isLocal: true,
          isDefault: false,
          isExecuting: false,
        },
      ]),
    ).toBe(0);
  });
});
