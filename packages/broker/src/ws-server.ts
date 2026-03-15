import { createServer } from "node:http";
import type { AddressInfo } from "node:net";
import { WebSocketServer, type RawData, type WebSocket } from "ws";
import { parseClientMessage, serializeProtocolMessage } from "@advaita/shared";
import { AdvaitaBroker, type AdvaitaBrokerOptions, type BrokerConnection } from "./broker.js";

export interface AdvaitaBrokerWsServerOptions extends AdvaitaBrokerOptions {
  host: string;
  port: number;
}

export class AdvaitaBrokerWsServer {
  private readonly server = createServer();
  private readonly wss = new WebSocketServer({ server: this.server });
  private readonly broker: AdvaitaBroker;
  private readonly host: string;
  private readonly port: number;

  constructor(options: AdvaitaBrokerWsServerOptions) {
    this.host = options.host;
    this.port = options.port;
    this.broker = new AdvaitaBroker(options);
  }

  async listen(): Promise<void> {
    this.wss.on("connection", (socket: WebSocket) => {
      let connection: BrokerConnection | null = null;

      socket.on("message", (raw: RawData) => {
        try {
          const message = parseClientMessage(raw.toString("utf8"));
          if (message.type === "client.hello") {
            connection = this.broker.connectClient(message, (brokerMessage) => {
              if (socket.readyState === socket.OPEN) {
                socket.send(serializeProtocolMessage(brokerMessage));
              }
            });
            return;
          }

          if (!connection) {
            this.sendNotice(socket, "error", "Must send client.hello before other messages");
            return;
          }

          void this.broker.handleClientMessage(connection, message).catch((error) => {
            const message = error instanceof Error ? error.message : String(error);
            this.sendNotice(socket, "error", message);
          });
        } catch (error) {
          const message = error instanceof Error ? error.message : String(error);
          this.sendNotice(socket, "error", message);
        }
      });

      socket.on("close", () => {
        if (connection) {
          this.broker.disconnectClient(connection);
        }
      });
    });

    await new Promise<void>((resolve) => {
      this.server.listen(this.port, this.host, resolve);
    });
  }

  async close(): Promise<void> {
    for (const client of this.wss.clients) {
      client.terminate();
    }
    await new Promise<void>((resolve, reject) => {
      this.wss.close((error?: Error) => (error ? reject(error) : resolve()));
    });
    await new Promise<void>((resolve, reject) => {
      this.server.close((error?: Error) => (error ? reject(error) : resolve()));
    });
  }

  get address(): string {
    const address = this.server.address() as AddressInfo | null;
    if (!address) {
      return `ws://${this.host}:${this.port}`;
    }
    return `ws://${address.address}:${address.port}`;
  }

  getBroker(): AdvaitaBroker {
    return this.broker;
  }

  private sendNotice(socket: WebSocket, level: "info" | "warning" | "error", message: string): void {
    if (socket.readyState === socket.OPEN) {
      socket.send(
        serializeProtocolMessage({
          type: "broker.notice",
          level,
          message,
        }),
      );
    }
  }
}
