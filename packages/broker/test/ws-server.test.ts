import { afterEach, describe, expect, it } from "vitest";
import { WebSocket } from "ws";
import type { BrokerMessage, ClientMessage } from "@advaita/shared";
import { parseBrokerMessage, serializeProtocolMessage } from "@advaita/shared";
import { AdvaitaBrokerWsServer } from "../src/ws-server.js";

async function waitForOpen(socket: WebSocket): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    socket.once("open", () => resolve());
    socket.once("error", reject);
  });
}

async function waitForMessage(messages: BrokerMessage[], type: BrokerMessage["type"], timeoutMs = 4000): Promise<BrokerMessage> {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    const found = messages.find((message) => message.type === type);
    if (found) {
      return found;
    }
    await new Promise((resolve) => setTimeout(resolve, 20));
  }
  throw new Error(`Timed out waiting for ${type}`);
}

describe("AdvaitaBrokerWsServer", () => {
  let server: AdvaitaBrokerWsServer | null = null;

  afterEach(async () => {
    if (server) {
      await server.close();
      server = null;
    }
  });

  it("accepts websocket clients and routes a basic self-executed turn", async () => {
    server = new AdvaitaBrokerWsServer({
      host: "127.0.0.1",
      port: 0,
      dataDir: `/tmp/advaita-broker-ws-${Date.now()}`,
      createTurnId: () => "turn-ws-1",
    });
    await server.listen();

    const socket = new WebSocket(server.address);
    const messages: BrokerMessage[] = [];
    socket.on("message", (raw) => {
      messages.push(parseBrokerMessage(raw.toString("utf8")));
    });
    await waitForOpen(socket);

    const hello: ClientMessage = {
      type: "client.hello",
      sessionName: "ws-demo",
      clientId: "client-mac",
      runtimeId: "mac",
      displayName: "Mac",
      cwd: "/Users/nickkarpov/advaita",
      modelState: {
        currentModel: { provider: "openai", modelId: "gpt-4", name: "GPT-4" },
        availableModels: [{ provider: "openai", modelId: "gpt-4", name: "GPT-4" }],
        thinkingLevel: "off",
      },
    };
    socket.send(serializeProtocolMessage(hello));
    expect((await waitForMessage(messages, "broker.snapshot")).type).toBe("broker.snapshot");

    socket.send(
      serializeProtocolMessage({
        type: "client.submit",
        text: "check the repo status",
      }),
    );

    const assigned = await waitForMessage(messages, "broker.turn.assigned");
    expect(assigned.type).toBe("broker.turn.assigned");
    if (assigned.type === "broker.turn.assigned") {
      expect(assigned.assignment.executionRuntimeId).toBe("mac");
      expect(assigned.assignment.executionClientId).toBe("client-mac");
    }

    socket.close();
  });
});
