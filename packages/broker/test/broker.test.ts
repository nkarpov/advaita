import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import type { BrokerMessage, ClientMessage, RuntimeModelState, TurnRoutingIntent } from "@advaita/shared";
import { ADVAITA_TURN_CUSTOM_TYPE, isAdvaitaTurnEntry } from "@advaita/shared";
import type { SessionEntry } from "@mariozechner/pi-coding-agent";
import { AdvaitaBroker, type BrokerConnection } from "../src/broker.js";
import { HeuristicTurnIntentRouter } from "../src/turn-intent-router.js";

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

function connectClient(
  broker: AdvaitaBroker,
  hello: Extract<ClientMessage, { type: "client.hello" }>,
): { connection: BrokerConnection; messages: BrokerMessage[] } {
  const messages: BrokerMessage[] = [];
  const connection = broker.connectClient(hello, (message) => {
    messages.push(message);
  });
  return { connection, messages };
}

function findLastMessage<T extends BrokerMessage["type"]>(messages: BrokerMessage[], type: T): Extract<BrokerMessage, { type: T }> | undefined {
  return [...messages].reverse().find((message): message is Extract<BrokerMessage, { type: T }> => message.type === type);
}

function findMessages<T extends BrokerMessage["type"]>(messages: BrokerMessage[], type: T): Extract<BrokerMessage, { type: T }>[] {
  return messages.filter((message): message is Extract<BrokerMessage, { type: T }> => message.type === type);
}

function assistantEntry(text: string, parentId: string | null): SessionEntry {
  return {
    type: "message",
    id: `assistant-${text.replace(/\s+/g, "-")}`,
    parentId,
    timestamp: "2026-03-14T00:00:10.000Z",
    message: {
      role: "assistant",
      content: [{ type: "text", text }],
      provider: "openai",
      model: "gpt-5",
      api: "openai-responses",
      usage: {
        input: 0,
        output: 0,
        cacheRead: 0,
        cacheWrite: 0,
        totalTokens: 0,
        cost: {
          input: 0,
          output: 0,
          cacheRead: 0,
          cacheWrite: 0,
          total: 0,
        },
      },
      stopReason: "stop",
      timestamp: 1,
    },
  } satisfies SessionEntry;
}

function createBroker(options: ConstructorParameters<typeof AdvaitaBroker>[0]): AdvaitaBroker {
  return new AdvaitaBroker({
    ...options,
    turnIntentRouter: options.turnIntentRouter ?? new HeuristicTurnIntentRouter(),
  });
}

function createDeferred<T>(): {
  promise: Promise<T>;
  resolve: (value: T) => void;
  reject: (error?: unknown) => void;
} {
  let resolve!: (value: T) => void;
  let reject!: (error?: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

describe("AdvaitaBroker", () => {
  it("appends the raw submitted user turn immediately before routing completes when the session is idle", async () => {
    const routed = createDeferred<TurnRoutingIntent>();
    const broker = createBroker({
      dataDir: mkdtempSync(join(tmpdir(), "advaita-broker-immediate-")),
      createTurnId: () => "turn-immediate",
      now: () => "2026-03-14T00:00:00.000Z",
      turnIntentRouter: {
        routeTurn: async () => routed.promise,
      },
    });

    const mac = connectClient(broker, {
      type: "client.hello",
      sessionName: "immediate",
      clientId: "client-mac",
      runtimeId: "mac",
      displayName: "Mac",
      cwd: "/Users/nickkarpov/advaita",
      modelState: createModelState({ provider: "openai", modelId: "gpt-4", name: "GPT-4" }),
    });

    const submitPromise = broker.handleClientMessage(mac.connection, {
      type: "client.submit",
      text: "inspect the repo",
    });
    await Promise.resolve();

    const initialAppend = findLastMessage(mac.messages, "broker.session.entries");
    expect(initialAppend?.entries).toHaveLength(2);
    const rawUserEntry = initialAppend?.entries.find(
      (entry): entry is Extract<SessionEntry, { type: "message" }> => entry.type === "message" && entry.message.role === "user",
    );
    expect(rawUserEntry?.message.content).toBe("inspect the repo");
    expect(findLastMessage(mac.messages, "broker.turn.assigned")).toBeUndefined();
    expect(
      broker.loadSession("immediate").entries.some(
        (entry) => entry.type === "message" && entry.message.role === "user" && entry.message.content === "inspect the repo",
      ),
    ).toBe(true);

    routed.resolve({
      action: "execute",
      requestedRuntimeId: null,
      runtimeScope: "none",
      requestedModelQuery: null,
      executionText: "inspect the repo",
      routingSource: "heuristic",
    });
    await submitPromise;

    const assigned = findLastMessage(mac.messages, "broker.turn.assigned");
    expect(assigned?.assignment.text).toBe("inspect the repo");
    expect(assigned?.assignment.executionText).toBe("inspect the repo");
  });

  it("seeds the shared current runtime from the first connected client and broadcasts joins into the session", () => {
    const broker = createBroker({
      dataDir: mkdtempSync(join(tmpdir(), "advaita-broker-connect-")),
      now: () => "2026-03-14T00:00:00.000Z",
    });

    const mac = connectClient(broker, {
      type: "client.hello",
      sessionName: "connect",
      clientId: "client-mac",
      runtimeId: "mac",
      displayName: "Mac",
      cwd: "/Users/nickkarpov/advaita",
      modelState: createModelState({ provider: "openai", modelId: "gpt-4", name: "GPT-4" }),
    });

    expect(findLastMessage(mac.messages, "broker.snapshot")?.session.metadata.currentRuntimeId).toBe("mac");
    expect(broker.loadSession("connect").metadata.currentRuntimeId).toBe("mac");

    const linux = connectClient(broker, {
      type: "client.hello",
      sessionName: "connect",
      clientId: "client-linux",
      runtimeId: "linux",
      displayName: "EVO-X1",
      cwd: "/home/nick/advaita",
      modelState: createModelState({ provider: "openai", modelId: "gpt-4", name: "GPT-4" }),
    });

    expect(findLastMessage(linux.messages, "broker.snapshot")?.session.metadata.currentRuntimeId).toBe("mac");
    const joinAppend = findLastMessage(mac.messages, "broker.session.entries");
    expect(
      joinAppend?.entries.some(
        (entry) => entry.type === "custom_message" && typeof entry.content === "string" && entry.content.includes("[advaita] EVO-X1 joined on linux"),
      ),
    ).toBe(true);
  });

  it("routes explicit runtime requests, streams live events, and commits canonical entries without changing the sticky runtime", async () => {
    const broker = createBroker({
      dataDir: mkdtempSync(join(tmpdir(), "advaita-broker-")),
      createTurnId: () => "turn-1",
      now: () => "2026-03-14T00:00:00.000Z",
    });

    const mac = connectClient(broker, {
      type: "client.hello",
      sessionName: "demo",
      clientId: "client-mac",
      runtimeId: "mac",
      displayName: "Mac",
      cwd: "/Users/nickkarpov/advaita",
      modelState: createModelState({ provider: "openai", modelId: "gpt-4", name: "GPT-4" }),
    });
    const linux = connectClient(broker, {
      type: "client.hello",
      sessionName: "demo",
      clientId: "client-linux",
      runtimeId: "linux",
      displayName: "Linux",
      cwd: "/home/nick/advaita",
      modelState: createModelState({ provider: "openai", modelId: "gpt-4", name: "GPT-4" }),
    });

    await broker.handleClientMessage(linux.connection, {
      type: "client.submit",
      text: "run this as mac and inspect the bundle using gpt 5",
    });

    const assignment = findLastMessage(mac.messages, "broker.turn.assigned");
    expect(assignment).toBeTruthy();
    expect(assignment?.assignment.executionRuntimeId).toBe("mac");
    expect(assignment?.assignment.executionClientId).toBe("client-mac");
    expect(assignment?.assignment.runtimeScope).toBe("turn");
    expect(assignment?.assignment.requestedModelQuery).toBe("gpt 5");

    const sessionEntryMessages = findMessages(linux.messages, "broker.session.entries");
    expect(
      sessionEntryMessages.some(
        (message) =>
          message.entries.length === 2
          && message.entries.some((entry) => entry.type === "message" && entry.message.role === "user"),
      ),
    ).toBe(true);
    expect(
      sessionEntryMessages.some((message) =>
        message.entries.some(
          (entry) => entry.type === "custom_message" && typeof entry.content === "string" && entry.content.includes("this turn will execute on mac"),
        ),
      ),
    ).toBe(true);

    await broker.handleClientMessage(mac.connection, {
      type: "client.turn.stream",
      stream: {
        turnId: "turn-1",
        sequence: 999,
        runtimeId: "ignored",
        clientId: "ignored",
        executionCwd: "/ignored",
        observedAt: "ignored",
        event: {
          type: "message_update",
          message: {
            role: "assistant",
            content: [{ type: "text", text: "streaming from mac" }],
            provider: "openai",
            model: "gpt-5",
            api: "openai-responses",
            usage: {
              input: 0,
              output: 0,
              cacheRead: 0,
              cacheWrite: 0,
              totalTokens: 0,
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
            delta: "streaming from mac",
          },
        },
      },
    });

    const streamed = findLastMessage(linux.messages, "broker.turn.stream");
    expect(streamed?.stream.runtimeId).toBe("mac");
    expect(streamed?.stream.clientId).toBe("client-mac");
    expect(streamed?.stream.sequence).toBe(0);

    const snapshotBeforeCommit = broker.loadSession("demo");
    const parentId = snapshotBeforeCommit.entries.at(-1)?.id ?? null;
    await broker.handleClientMessage(mac.connection, {
      type: "client.turn.commit",
      commit: {
        turnId: "turn-1",
        executionRuntimeId: "ignored",
        executionClientId: "ignored",
        executionCwd: "ignored",
        committedAt: "ignored",
        sessionRevision: snapshotBeforeCommit.metadata.revision,
        entries: [assistantEntry("done from mac", parentId)],
        modelState: createModelState({ provider: "openai", modelId: "gpt-5", name: "GPT-5" }),
      },
    });

    const committed = findLastMessage(linux.messages, "broker.session.commit");
    expect(committed?.commit.turnId).toBe("turn-1");
    expect(committed?.commit.executionRuntimeId).toBe("mac");
    expect(committed?.metadata.currentRuntimeId).toBe("mac");
    expect(
      committed?.commit.entries.some(
        (entry) => entry.type === "custom_message" && typeof entry.content === "string" && entry.content.includes("mac model set to GPT-5"),
      ),
    ).toBe(true);

    const stored = broker.loadSession("demo");
    expect(stored.metadata.currentRuntimeId).toBe("mac");
    expect(stored.entries.some((entry) => isAdvaitaTurnEntry(entry) && entry.customType === ADVAITA_TURN_CUSTOM_TYPE)).toBe(true);
    expect(stored.entries.some((entry) => entry.type === "message" && entry.message.role === "assistant")).toBe(true);
  });

  it("keeps runtime-local sticky model state on the targeted executor only", async () => {
    const broker = createBroker({
      dataDir: mkdtempSync(join(tmpdir(), "advaita-broker-model-")),
      createTurnId: () => "turn-2",
      now: () => "2026-03-14T00:00:00.000Z",
    });

    const mac = connectClient(broker, {
      type: "client.hello",
      sessionName: "models",
      clientId: "client-mac",
      runtimeId: "mac",
      displayName: "Mac",
      cwd: "/Users/nickkarpov/advaita",
      modelState: createModelState({ provider: "openai", modelId: "gpt-4", name: "GPT-4" }),
    });
    const linux = connectClient(broker, {
      type: "client.hello",
      sessionName: "models",
      clientId: "client-linux",
      runtimeId: "linux",
      displayName: "Linux",
      cwd: "/home/nick/advaita",
      modelState: createModelState({ provider: "openai", modelId: "gpt-4", name: "GPT-4" }),
    });

    await broker.handleClientMessage(mac.connection, {
      type: "client.submit",
      text: "run this on linux using gpt 5",
    });

    const assignment = findLastMessage(linux.messages, "broker.turn.assigned");
    expect(assignment?.assignment.executionRuntimeId).toBe("linux");
    expect(assignment?.assignment.requestedModelQuery).toBe("gpt 5");
    expect(assignment?.assignment.runtimeScope).toBe("turn");
    const routeAppend = findLastMessage(mac.messages, "broker.session.entries");
    expect(
      routeAppend?.entries.some(
        (entry) => entry.type === "custom_message" && typeof entry.content === "string" && entry.content.includes("requested model: gpt 5"),
      ),
    ).toBe(true);

    await broker.handleClientMessage(linux.connection, {
      type: "client.runtime.model_state",
      modelState: createModelState({ provider: "openai", modelId: "gpt-5", name: "GPT-5" }),
    });

    const presence = findLastMessage(mac.messages, "broker.presence");
    const macPresence = presence?.presence.find((item) => item.runtimeId === "mac");
    const linuxPresence = presence?.presence.find((item) => item.runtimeId === "linux");
    expect(macPresence?.modelState.currentModel?.modelId).toBe("gpt-4");
    expect(linuxPresence?.modelState.currentModel?.modelId).toBe("gpt-5");

    const snapshotBeforeCommit = broker.loadSession("models");
    const parentId = snapshotBeforeCommit.entries.at(-1)?.id ?? null;
    await broker.handleClientMessage(linux.connection, {
      type: "client.turn.commit",
      commit: {
        turnId: "turn-2",
        executionRuntimeId: "ignored",
        executionClientId: "ignored",
        executionCwd: "ignored",
        committedAt: "ignored",
        sessionRevision: snapshotBeforeCommit.metadata.revision,
        entries: [assistantEntry("done on linux", parentId)],
        modelState: createModelState({ provider: "openai", modelId: "gpt-5", name: "GPT-5" }),
      },
    });

    const commit = findLastMessage(mac.messages, "broker.session.commit");
    expect(commit?.commit.modelState.currentModel?.modelId).toBe("gpt-5");
    const finalPresence = findLastMessage(mac.messages, "broker.presence");
    expect(finalPresence?.presence.find((item) => item.runtimeId === "mac")?.modelState.currentModel?.modelId).toBe("gpt-4");
    expect(finalPresence?.presence.find((item) => item.runtimeId === "linux")?.modelState.currentModel?.modelId).toBe("gpt-5");
  });

  it("updates the shared default runtime when explicitly switched", async () => {
    const broker = createBroker({
      dataDir: mkdtempSync(join(tmpdir(), "advaita-broker-switch-")),
      now: () => "2026-03-14T00:00:00.000Z",
    });

    const mac = connectClient(broker, {
      type: "client.hello",
      sessionName: "switch-runtime",
      clientId: "client-mac",
      runtimeId: "mac",
      displayName: "Mac",
      cwd: "/Users/nickkarpov/advaita",
      modelState: createModelState({ provider: "openai", modelId: "gpt-4", name: "GPT-4" }),
    });
    connectClient(broker, {
      type: "client.hello",
      sessionName: "switch-runtime",
      clientId: "client-linux",
      runtimeId: "linux",
      displayName: "Linux",
      cwd: "/home/nick/advaita",
      modelState: createModelState({ provider: "openai", modelId: "gpt-4", name: "GPT-4" }),
    });

    await broker.handleClientMessage(mac.connection, {
      type: "client.switch_runtime",
      runtimeId: "linux",
    });

    const turnState = findLastMessage(mac.messages, "broker.turn.state");
    expect(turnState?.currentRuntimeId).toBe("linux");
    expect(broker.loadSession("switch-runtime").metadata.currentRuntimeId).toBe("linux");
    const switchAppend = findLastMessage(mac.messages, "broker.session.entries");
    expect(
      switchAppend?.entries.some(
        (entry) => entry.type === "custom_message" && typeof entry.content === "string" && entry.content.includes("default runtime switched to linux"),
      ),
    ).toBe(true);
  });

  it("supports natural-language sticky runtime switches without enqueuing a turn", async () => {
    const broker = createBroker({
      dataDir: mkdtempSync(join(tmpdir(), "advaita-broker-natural-switch-")),
      now: () => "2026-03-14T00:00:00.000Z",
    });

    const mac = connectClient(broker, {
      type: "client.hello",
      sessionName: "natural-switch",
      clientId: "client-mac",
      runtimeId: "mac",
      displayName: "Mac",
      cwd: "/Users/nickkarpov/advaita",
      modelState: createModelState({ provider: "openai", modelId: "gpt-4", name: "GPT-4" }),
    });
    connectClient(broker, {
      type: "client.hello",
      sessionName: "natural-switch",
      clientId: "client-linux",
      runtimeId: "linux",
      displayName: "Linux",
      cwd: "/home/nick/advaita",
      modelState: createModelState({ provider: "openai", modelId: "gpt-4", name: "GPT-4" }),
    });

    await broker.handleClientMessage(mac.connection, {
      type: "client.submit",
      text: "switch to linux",
    });

    expect(broker.getQueuedCount("natural-switch")).toBe(0);
    expect(broker.getActiveTurn("natural-switch")).toBeNull();
    expect(broker.loadSession("natural-switch").metadata.currentRuntimeId).toBe("linux");
    const switchAppend = findLastMessage(mac.messages, "broker.session.entries");
    expect(
      switchAppend?.entries.some(
        (entry) => entry.type === "custom_message" && typeof entry.content === "string" && entry.content.includes("default runtime switched to linux"),
      ),
    ).toBe(true);
  });

  it("reassigns an active turn after executor disconnect without duplicating the committed user turn", async () => {
    let tick = 0;
    const broker = createBroker({
      dataDir: mkdtempSync(join(tmpdir(), "advaita-broker-reassign-")),
      createTurnId: () => "turn-3",
      now: () => `2026-03-14T00:00:${String(tick++).padStart(2, "0")}.000Z`,
    });

    const mac = connectClient(broker, {
      type: "client.hello",
      sessionName: "reassign",
      clientId: "client-mac",
      runtimeId: "mac",
      displayName: "Mac",
      cwd: "/Users/nickkarpov/advaita",
      modelState: createModelState({ provider: "openai", modelId: "gpt-4", name: "GPT-4" }),
    });
    connectClient(broker, {
      type: "client.hello",
      sessionName: "reassign",
      clientId: "client-linux-a",
      runtimeId: "linux",
      displayName: "Linux A",
      cwd: "/home/nick/advaita-a",
      modelState: createModelState({ provider: "openai", modelId: "gpt-4", name: "GPT-4" }),
    });
    const linuxB = connectClient(broker, {
      type: "client.hello",
      sessionName: "reassign",
      clientId: "client-linux-b",
      runtimeId: "linux",
      displayName: "Linux B",
      cwd: "/home/nick/advaita-b",
      modelState: createModelState({ provider: "openai", modelId: "gpt-4", name: "GPT-4" }),
    });

    await broker.handleClientMessage(mac.connection, {
      type: "client.submit",
      text: "run this on linux",
    });

    const initialAssignment = findLastMessage(linuxB.messages, "broker.turn.assigned");
    expect(initialAssignment?.assignment.executionClientId).toBe("client-linux-b");

    broker.disconnectClient(linuxB.connection);

    const reassigned = broker.getActiveTurn("reassign");
    expect(reassigned?.turnId).toBe("turn-3");
    expect(reassigned?.executionRuntimeId).toBe("linux");
    expect(reassigned?.executionClientId).toBe("client-linux-a");

    const stored = broker.loadSession("reassign");
    const userMessages = stored.entries.filter((entry) => entry.type === "message" && entry.message.role === "user");
    const turnEntries = stored.entries.filter((entry) => isAdvaitaTurnEntry(entry));
    expect(userMessages).toHaveLength(1);
    expect(turnEntries).toHaveLength(1);
  });

  it("gives late joiners a snapshot with active turn metadata and committed transcript", async () => {
    const broker = createBroker({
      dataDir: mkdtempSync(join(tmpdir(), "advaita-broker-late-join-")),
      createTurnId: () => "turn-4",
      now: () => "2026-03-14T00:00:00.000Z",
    });

    connectClient(broker, {
      type: "client.hello",
      sessionName: "late-join",
      clientId: "client-mac",
      runtimeId: "mac",
      displayName: "Mac",
      cwd: "/Users/nickkarpov/advaita",
      modelState: createModelState({ provider: "openai", modelId: "gpt-4", name: "GPT-4" }),
    });
    const linux = connectClient(broker, {
      type: "client.hello",
      sessionName: "late-join",
      clientId: "client-linux",
      runtimeId: "linux",
      displayName: "Linux",
      cwd: "/home/nick/advaita",
      modelState: createModelState({ provider: "openai", modelId: "gpt-4", name: "GPT-4" }),
    });

    await broker.handleClientMessage(linux.connection, {
      type: "client.submit",
      text: "run this as mac",
    });

    const lateJoiner = connectClient(broker, {
      type: "client.hello",
      sessionName: "late-join",
      clientId: "client-late",
      runtimeId: "ipad",
      displayName: "iPad",
      cwd: "/tmp/ipad",
      modelState: createModelState(null),
    });

    const snapshot = findLastMessage(lateJoiner.messages, "broker.snapshot");
    expect(snapshot?.activeTurnId).toBe("turn-4");
    expect(snapshot?.executorRuntimeId).toBe("mac");
    expect(snapshot?.session.entries.some((entry) => isAdvaitaTurnEntry(entry))).toBe(true);
    expect(snapshot?.session.entries.some((entry) => entry.type === "message" && entry.message.role === "user")).toBe(true);
  });
});
