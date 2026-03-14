import WebSocket from "ws";
import type { BrokerMessage, ClientMessage } from "@advaita/shared";
import { parseBrokerMessage, serializeProtocolMessage } from "@advaita/shared";

export interface BrokerClientConfig {
  url: string;
}

export interface BrokerClientHandlers {
  onOpen: () => void;
  onClose: () => void;
  onError: (error: Error) => void;
  onMessage: (message: BrokerMessage) => void;
}

export class BrokerClient {
  private socket: WebSocket | undefined;

  constructor(
    private readonly config: BrokerClientConfig,
    private readonly handlers: BrokerClientHandlers,
  ) {}

  connect(): void {
    this.disconnect();
    const socket = new WebSocket(this.config.url);
    this.socket = socket;

    socket.on("open", () => {
      if (this.socket !== socket) return;
      this.handlers.onOpen();
    });

    socket.on("message", (raw) => {
      if (this.socket !== socket) return;
      try {
        this.handlers.onMessage(parseBrokerMessage(raw.toString("utf8")));
      } catch (error) {
        const err = error instanceof Error ? error : new Error(String(error));
        this.handlers.onError(err);
      }
    });

    socket.on("error", (error) => {
      if (this.socket !== socket) return;
      const err = error instanceof Error ? error : new Error(String(error));
      this.handlers.onError(err);
    });

    socket.on("close", () => {
      if (this.socket !== socket) return;
      this.socket = undefined;
      this.handlers.onClose();
    });
  }

  disconnect(): void {
    if (this.socket) {
      this.socket.removeAllListeners();
      this.socket.close();
      this.socket = undefined;
    }
  }

  send(message: ClientMessage): boolean {
    if (!this.socket || this.socket.readyState !== WebSocket.OPEN) {
      return false;
    }
    this.socket.send(serializeProtocolMessage(message));
    return true;
  }

  isConnected(): boolean {
    return this.socket?.readyState === WebSocket.OPEN;
  }
}
