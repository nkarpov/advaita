import { describe, expect, it } from "vitest";
import {
  parseBrokerMessage,
  parseClientMessage,
  serializeProtocolMessage,
  type BrokerMessage,
  type ClientMessage,
} from "../src/protocol.js";

const modelState = {
  currentModel: { provider: "openai", modelId: "gpt-5", name: "GPT-5" },
  availableModels: [
    { provider: "openai", modelId: "gpt-5", name: "GPT-5" },
    { provider: "anthropic", modelId: "claude-sonnet-4-5", name: "Claude Sonnet 4.5" },
  ],
  thinkingLevel: "high" as const,
};

const sessionSnapshot = {
  header: {
    type: "session" as const,
    version: 3,
    id: "session-1",
    timestamp: "2026-03-14T00:00:00.000Z",
    cwd: "/advaita/demo",
  },
  entries: [
    {
      type: "message" as const,
      id: "u1",
      parentId: null,
      timestamp: "2026-03-14T00:00:01.000Z",
      message: {
        role: "user" as const,
        content: "hello",
        timestamp: 1,
      },
    },
  ],
  metadata: {
    name: "demo",
    createdAt: "2026-03-14T00:00:00.000Z",
    updatedAt: "2026-03-14T00:00:01.000Z",
    revision: 1,
    currentRuntimeId: "mac",
    activeTurnId: null,
  },
};

describe("protocol envelopes", () => {
  it("serializes and parses client hello messages", () => {
    const message: ClientMessage = {
      type: "client.hello",
      sessionName: "demo",
      clientId: "client-mac",
      runtimeId: "mac",
      displayName: "Nick's Mac",
      cwd: "/Users/nickkarpov/advaita",
      modelState,
    };

    const parsed = parseClientMessage(serializeProtocolMessage(message).trim());
    expect(parsed).toEqual(message);
  });

  it("serializes and parses explicit runtime switch requests", () => {
    const message: ClientMessage = {
      type: "client.switch_runtime",
      runtimeId: "linux",
    };

    const parsed = parseClientMessage(serializeProtocolMessage(message).trim());
    expect(parsed).toEqual(message);
  });

  it("serializes and parses broker snapshots", () => {
    const message: BrokerMessage = {
      type: "broker.snapshot",
      session: sessionSnapshot,
      presence: [
        {
          clientId: "client-mac",
          runtimeId: "mac",
          displayName: "Nick's Mac",
          cwd: "/Users/nickkarpov/advaita",
          connectedAt: "2026-03-14T00:00:02.000Z",
          lastSeenAt: "2026-03-14T00:00:03.000Z",
          typing: false,
          executing: false,
          modelState,
        },
      ],
      queuedCount: 0,
      activeTurnId: null,
      executorRuntimeId: null,
      executorClientId: null,
      executionCwd: null,
    };

    const parsed = parseBrokerMessage(serializeProtocolMessage(message).trim());
    expect(parsed).toEqual(message);
  });

  it("serializes generic session entry appends for pre-turn user commits", () => {
    const message: BrokerMessage = {
      type: "broker.session.entries",
      entries: sessionSnapshot.entries,
      metadata: sessionSnapshot.metadata,
    };

    const parsed = parseBrokerMessage(serializeProtocolMessage(message).trim());
    expect(parsed).toEqual(message);
  });

  it("serializes executor turn commits with a non-negative session revision", () => {
    const message: ClientMessage = {
      type: "client.turn.commit",
      commit: {
        turnId: "turn-1",
        executionRuntimeId: "mac",
        executionClientId: "client-mac",
        executionCwd: "/Users/nickkarpov/advaita",
        committedAt: "2026-03-14T00:00:05.000Z",
        sessionRevision: 1,
        entries: sessionSnapshot.entries,
        modelState,
      },
    };

    const parsed = parseClientMessage(serializeProtocolMessage(message).trim());
    expect(parsed).toEqual(message);
  });

  it("serializes turn assignments with sticky-routing metadata", () => {
    const message: BrokerMessage = {
      type: "broker.turn.assigned",
      assignment: {
        turnId: "turn-1",
        text: "switch to linux and inspect the repo using gpt 5",
        originClientId: "client-mac",
        originRuntimeId: "mac",
        originCwd: "/Users/nickkarpov/advaita",
        submittedAt: "2026-03-14T00:00:04.000Z",
        requestedRuntimeId: "linux",
        runtimeScope: "session",
        requestedModelQuery: "gpt 5",
        executionText: "switch to linux and inspect the repo using gpt 5",
        routingSource: "llm",
        sessionName: "demo",
        snapshot: sessionSnapshot,
        executionRuntimeId: "linux",
        executionClientId: "client-linux",
        executionCwd: "/home/nick/advaita",
        queuedAt: "2026-03-14T00:00:04.000Z",
      },
    };

    const parsed = parseBrokerMessage(serializeProtocolMessage(message).trim());
    expect(parsed).toEqual(message);
  });

  it("carries live streamed turn events as the primary mirror path", () => {
    const message: BrokerMessage = {
      type: "broker.turn.stream",
      stream: {
        turnId: "turn-1",
        sequence: 4,
        runtimeId: "linux",
        clientId: "client-linux",
        executionCwd: "/home/nick/advaita",
        observedAt: "2026-03-14T00:00:04.000Z",
        event: {
          type: "message_update",
          message: {
            role: "assistant",
            content: [{ type: "text", text: "Streaming from remote" }],
            api: "openai-responses",
            provider: "openai",
            model: "gpt-5",
            usage: {
              input: 1,
              output: 1,
              cacheRead: 0,
              cacheWrite: 0,
              totalTokens: 2,
              cost: {
                input: 0,
                output: 0,
                cacheRead: 0,
                cacheWrite: 0,
                total: 0,
              },
            },
            stopReason: "max_tokens",
            timestamp: 1,
          },
          assistantMessageEvent: {
            type: "text-delta",
            delta: "Streaming from remote",
          },
        },
      },
    };

    const parsed = parseBrokerMessage(serializeProtocolMessage(message).trim());
    expect(parsed).toEqual(message);
  });
});
