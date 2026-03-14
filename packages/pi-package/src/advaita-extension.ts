import { hostname } from "node:os";
import { randomUUID } from "node:crypto";
import type {
  BrokerMessage,
  ClientPresence,
  ClientMessage,
  RuntimeModelState,
  SessionSnapshot,
  TurnAssignment,
} from "@advaita/shared";
import type { ExtensionAPI, ExtensionContext } from "@mariozechner/pi-coding-agent";
import { BrokerClient } from "./broker-client.js";
import { isDeferredSharedSessionCommand, shouldBrokerInput } from "./command-classification.js";
import { resolveModelQuery } from "./model-resolution.js";
import { formatFooterStatus } from "./status.js";

interface AdvaitaConnectionConfig {
  url: string;
  sessionName: string;
  runtimeId: string;
  displayName: string;
  clientId: string;
}

function sanitizeRuntimeId(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9._-]+/g, "-")
    .replace(/^-+|-+$/g, "") || "runtime";
}

function splitArgs(args: string): string[] {
  return args
    .trim()
    .split(/\s+/)
    .filter(Boolean);
}

class AdvaitaExtensionController {
  private readonly clientId = randomUUID();
  private broker: BrokerClient | undefined;
  private ctx: ExtensionContext | undefined;
  private connectionConfig: AdvaitaConnectionConfig | undefined;
  private connected = false;
  private presence: ClientPresence[] = [];
  private sessionName: string | null = null;
  private queuedCount = 0;
  private currentRuntimeId: string | null = null;
  private activeTurnId: string | null = null;
  private executorRuntimeId: string | null = null;
  private executorClientId: string | null = null;
  private executionCwd: string | null = null;
  private executingTurnId: string | null = null;
  private messageQueue: Promise<void> = Promise.resolve();
  private typingTimeout: NodeJS.Timeout | undefined;
  private terminalInputUnsubscribe: (() => void) | undefined;

  constructor(private readonly pi: ExtensionAPI) {}

  register(): void {
    this.registerFlags();
    this.registerCommands();
    this.registerEvents();
  }

  private registerFlags(): void {
    this.pi.registerFlag("advaita-url", { description: "Advaita broker websocket URL", type: "string" });
    this.pi.registerFlag("advaita-session", { description: "Advaita shared session name", type: "string" });
    this.pi.registerFlag("advaita-runtime", { description: "Advaita runtime identifier", type: "string" });
    this.pi.registerFlag("advaita-display-name", { description: "Advaita display name", type: "string" });
    this.pi.registerFlag("advaita-client-id", { description: "Advaita client id override", type: "string" });
  }

  private registerCommands(): void {
    this.pi.registerCommand("advaita-connect", {
      description: "Connect this Pi session to an Advaita broker: /advaita-connect <ws-url> <session> [runtimeId]",
      handler: async (args, ctx) => {
        const parts = splitArgs(args);
        if (parts.length < 2) {
          ctx.ui.notify("Usage: /advaita-connect <ws-url> <session> [runtimeId]", "warning");
          return;
        }
        const [url, sessionName, runtimeId] = parts;
        const config: AdvaitaConnectionConfig = {
          url,
          sessionName,
          runtimeId: sanitizeRuntimeId(runtimeId ?? this.defaultRuntimeId()),
          displayName: this.defaultDisplayName(),
          clientId: this.resolveClientId(),
        };
        await this.connect(ctx, config);
        ctx.ui.notify(`Connected to Advaita session ${sessionName}`, "info");
      },
    });

    this.pi.registerCommand("advaita-disconnect", {
      description: "Disconnect this Pi session from Advaita",
      handler: async (_args, ctx) => {
        this.disconnect();
        this.updateFooterStatus();
        ctx.ui.notify("Disconnected from Advaita", "info");
      },
    });

    this.pi.registerCommand("advaita-debug", {
      description: "Show Advaita connection and broker state",
      handler: async (_args, ctx) => {
        await ctx.ui.editor(
          "Advaita Debug",
          JSON.stringify(
            {
              connected: this.connected,
              config: this.connectionConfig,
              sessionName: this.sessionName,
              currentRuntimeId: this.currentRuntimeId,
              activeTurnId: this.activeTurnId,
              executorRuntimeId: this.executorRuntimeId,
              executorClientId: this.executorClientId,
              executionCwd: this.executionCwd,
              queuedCount: this.queuedCount,
              presence: this.presence,
            },
            null,
            2,
          ),
        );
      },
    });

    this.pi.registerCommand("route-debug", {
      description: "Alias for /advaita-debug",
      handler: async (_args, ctx) => {
        await ctx.ui.editor(
          "Advaita Route Debug",
          JSON.stringify(
            {
              currentRuntimeId: this.currentRuntimeId,
              activeTurnId: this.activeTurnId,
              executorRuntimeId: this.executorRuntimeId,
              executorClientId: this.executorClientId,
              executionCwd: this.executionCwd,
              queuedCount: this.queuedCount,
              presence: this.presence,
            },
            null,
            2,
          ),
        );
      },
    });

    this.pi.registerCommand("runtime", {
      description: "Set or inspect the shared default runtime: /runtime <runtimeId>",
      handler: async (args, ctx) => {
        if (!this.connected || !this.broker) {
          ctx.ui.notify("Advaita is not connected", "warning");
          return;
        }
        const runtimeId = args.trim();
        if (!runtimeId) {
          ctx.ui.notify(`Current shared runtime: ${this.currentRuntimeId ?? "none"}`, "info");
          return;
        }
        const sent = this.broker.send({ type: "client.switch_runtime", runtimeId });
        if (!sent) {
          ctx.ui.notify("Broker connection is not ready", "warning");
          return;
        }
        ctx.ui.notify(`Requested shared runtime switch to ${runtimeId}`, "info");
      },
    });
  }

  private registerEvents(): void {
    this.pi.on("session_start", async (_event, ctx) => {
      this.ctx = ctx;
      this.installTerminalTypingBridge(ctx);
      this.updateFooterStatus();
      const config = this.resolveConfigFromFlags();
      if (config) {
        await this.connect(ctx, config);
      }
    });

    this.pi.on("session_shutdown", async () => {
      this.disconnect();
    });

    this.pi.on("session_before_switch", async (event, ctx) => {
      if (!this.connected) return;
      if (event.reason === "new" || event.reason === "resume") {
        ctx.ui.notify("/new and /resume are not supported while connected to a shared Advaita session yet.", "warning");
        return { cancel: true };
      }
    });

    this.pi.on("session_before_fork", async (_event, ctx) => {
      if (!this.connected) return;
      ctx.ui.notify("/fork is not supported while connected to a shared Advaita session yet.", "warning");
      return { cancel: true };
    });

    this.pi.on("session_before_tree", async (_event, ctx) => {
      if (!this.connected) return;
      ctx.ui.notify("/tree navigation is not supported while connected to a shared Advaita session yet.", "warning");
      return { cancel: true };
    });

    this.pi.on("input", async (event, ctx) => {
      this.ctx = ctx;
      if (this.connected && (event.images?.length ?? 0) > 0 && event.source !== "extension") {
        ctx.ui.notify("Shared Advaita turns with images are not supported yet.", "warning");
        return { action: "handled" };
      }

      if (
        shouldBrokerInput({
          connected: this.connected,
          source: event.source,
          text: event.text,
          hasImages: (event.images?.length ?? 0) > 0,
        })
      ) {
        this.setTyping(false);
        const sent = this.broker?.send({ type: "client.submit", text: event.text }) ?? false;
        if (!sent) {
          ctx.ui.notify("Advaita broker connection is not ready", "warning");
          return { action: "handled" };
        }
        return { action: "handled" };
      }

      return { action: "continue" };
    });

    this.pi.on("model_select", async () => {
      this.publishModelState();
    });

    const streamIfExecuting = async (event: BrokerMessage["type"] extends never ? never : any) => {
      if (!this.executingTurnId || !this.broker) return;
      this.broker.send({
        type: "client.turn.stream",
        stream: {
          turnId: this.executingTurnId,
          sequence: 0,
          runtimeId: this.connectionConfig?.runtimeId ?? this.defaultRuntimeId(),
          clientId: this.resolveClientId(),
          executionCwd: this.ctx?.cwd ?? process.cwd(),
          observedAt: new Date().toISOString(),
          event,
        },
      });
    };

    this.pi.on("agent_start", async (event) => streamIfExecuting(event));
    this.pi.on("agent_end", async (event) => streamIfExecuting(event));
    this.pi.on("turn_start", async (event) => streamIfExecuting(event));
    this.pi.on("turn_end", async (event) => streamIfExecuting(event));
    this.pi.on("message_start", async (event) => streamIfExecuting(event));
    this.pi.on("message_update", async (event) => streamIfExecuting(event));
    this.pi.on("message_end", async (event) => streamIfExecuting(event));
    this.pi.on("tool_execution_start", async (event) => streamIfExecuting(event));
    this.pi.on("tool_execution_update", async (event) => streamIfExecuting(event));
    this.pi.on("tool_execution_end", async (event) => streamIfExecuting(event));
  }

  private resolveConfigFromFlags(): AdvaitaConnectionConfig | undefined {
    const url = this.stringFlag("advaita-url");
    const sessionName = this.stringFlag("advaita-session");
    if (!url || !sessionName) {
      return undefined;
    }
    return {
      url,
      sessionName,
      runtimeId: sanitizeRuntimeId(this.stringFlag("advaita-runtime") ?? this.defaultRuntimeId()),
      displayName: this.stringFlag("advaita-display-name") ?? this.defaultDisplayName(),
      clientId: this.stringFlag("advaita-client-id") ?? this.resolveClientId(),
    };
  }

  private stringFlag(name: string): string | undefined {
    const value = this.pi.getFlag(name);
    return typeof value === "string" && value.trim().length > 0 ? value.trim() : undefined;
  }

  private defaultRuntimeId(): string {
    return sanitizeRuntimeId(hostname());
  }

  private defaultDisplayName(): string {
    return hostname();
  }

  private resolveClientId(): string {
    return this.connectionConfig?.clientId ?? this.clientId;
  }

  private async connect(ctx: ExtensionContext, config: AdvaitaConnectionConfig): Promise<void> {
    this.ctx = ctx;
    this.disconnect();
    this.connectionConfig = config;
    this.sessionName = config.sessionName;
    this.broker = new BrokerClient(
      { url: config.url },
      {
        onOpen: () => {
          this.connected = true;
          this.sendHello();
          this.updateFooterStatus();
          ctx.ui.notify(`Advaita connected to ${config.sessionName}`, "info");
        },
        onClose: () => {
          this.connected = false;
          this.updateFooterStatus();
        },
        onError: (error) => {
          this.connected = false;
          this.updateFooterStatus();
          ctx.ui.notify(`Advaita broker error: ${error.message}`, "error");
        },
        onMessage: (message) => {
          this.messageQueue = this.messageQueue
            .then(() => this.handleBrokerMessage(message))
            .catch((error) => {
              const err = error instanceof Error ? error : new Error(String(error));
              this.ctx?.ui.notify(`Advaita sync error: ${err.message}`, "error");
            });
        },
      },
    );
    this.broker.connect();
    this.updateFooterStatus();
  }

  private disconnect(): void {
    this.setTyping(false);
    this.executingTurnId = null;
    this.connected = false;
    this.broker?.disconnect();
    this.broker = undefined;
    this.presence = [];
    this.queuedCount = 0;
    this.currentRuntimeId = null;
    this.activeTurnId = null;
    this.executorRuntimeId = null;
    this.executorClientId = null;
    this.executionCwd = null;
  }

  private sendHello(): void {
    if (!this.broker || !this.connectionConfig || !this.ctx) return;
    this.broker.send({
      type: "client.hello",
      sessionName: this.connectionConfig.sessionName,
      clientId: this.connectionConfig.clientId,
      runtimeId: this.connectionConfig.runtimeId,
      displayName: this.connectionConfig.displayName,
      cwd: this.ctx.cwd,
      modelState: this.currentModelState(),
    });
  }

  private async handleBrokerMessage(message: BrokerMessage): Promise<void> {
    switch (message.type) {
      case "broker.snapshot": {
        this.presence = message.presence;
        this.queuedCount = message.queuedCount;
        this.activeTurnId = message.activeTurnId;
        this.executorRuntimeId = message.executorRuntimeId;
        this.executorClientId = message.executorClientId;
        this.executionCwd = message.executionCwd;
        this.currentRuntimeId = message.session.metadata.currentRuntimeId;
        await this.syncSnapshot(message.session);
        break;
      }
      case "broker.presence": {
        this.presence = message.presence;
        this.queuedCount = message.queuedCount;
        this.activeTurnId = message.activeTurnId;
        break;
      }
      case "broker.session.entries": {
        await this.importCommittedEntries(message.entries);
        this.currentRuntimeId = message.metadata.currentRuntimeId;
        break;
      }
      case "broker.session.commit": {
        await this.importCommittedEntries(message.commit.entries);
        this.currentRuntimeId = message.metadata.currentRuntimeId;
        this.activeTurnId = message.metadata.activeTurnId;
        this.publishModelState();
        break;
      }
      case "broker.turn.assigned": {
        this.activeTurnId = message.assignment.turnId;
        this.currentRuntimeId = message.assignment.executionRuntimeId;
        this.executorRuntimeId = message.assignment.executionRuntimeId;
        this.executorClientId = message.assignment.executionClientId;
        this.executionCwd = message.assignment.executionCwd;
        if (this.connectionConfig && message.assignment.executionClientId === this.connectionConfig.clientId) {
          await this.executeAssignedTurn(message.assignment);
        }
        break;
      }
      case "broker.turn.stream": {
        if (!this.connectionConfig || message.stream.clientId === this.connectionConfig.clientId) {
          break;
        }
        await this.ctx?.ui.renderExternalEvent(message.stream.event);
        break;
      }
      case "broker.turn.state": {
        this.activeTurnId = message.activeTurnId;
        this.queuedCount = message.queuedCount;
        this.currentRuntimeId = message.currentRuntimeId;
        this.executorRuntimeId = message.executorRuntimeId;
        this.executorClientId = message.executorClientId;
        this.executionCwd = message.executionCwd;
        break;
      }
      case "broker.notice": {
        this.ctx?.ui.notify(message.message, message.level);
        break;
      }
    }
    this.updateFooterStatus();
  }

  private async syncSnapshot(snapshot: SessionSnapshot): Promise<void> {
    await this.pi.replaceSessionContents(snapshot, {
      restoreModel: false,
      restoreThinkingLevel: false,
    });
    this.ctx?.ui.rebuildChatFromSession();
  }

  private async importCommittedEntries(entries: SessionSnapshot["entries"]): Promise<void> {
    const imported = await this.pi.importSessionEntries(entries, {
      skipExistingIds: true,
      restoreModel: false,
      restoreThinkingLevel: false,
    });
    if (imported.length > 0) {
      this.ctx?.ui.rebuildChatFromSession();
    }
  }

  private async executeAssignedTurn(assignment: TurnAssignment): Promise<void> {
    if (!this.ctx || !this.connectionConfig || !this.broker) return;

    this.executingTurnId = assignment.turnId;
    await this.syncSnapshot(assignment.snapshot);
    const beforeCount = this.ctx.sessionManager.getEntries().length;

    try {
      if (assignment.requestedModelQuery) {
        const resolvedModel = resolveModelQuery(assignment.requestedModelQuery, this.ctx.modelRegistry.getAvailable());
        if (!resolvedModel) {
          throw new Error(`Requested model \"${assignment.requestedModelQuery}\" is not available on ${this.connectionConfig.runtimeId}`);
        }
        const changed = await this.pi.setModel(resolvedModel);
        if (!changed) {
          throw new Error(`No API key available for ${resolvedModel.provider}/${resolvedModel.id}`);
        }
      }

      await this.pi.continueSession();

      const afterEntries = this.ctx.sessionManager.getEntries();
      const appendedEntries = afterEntries.slice(beforeCount);
      const commit: ClientMessage = {
        type: "client.turn.commit",
        commit: {
          turnId: assignment.turnId,
          executionRuntimeId: assignment.executionRuntimeId,
          executionClientId: assignment.executionClientId,
          executionCwd: assignment.executionCwd,
          committedAt: new Date().toISOString(),
          sessionRevision: -1,
          entries: appendedEntries,
          modelState: this.currentModelState(),
        },
      };
      this.broker.send(commit);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.ctx.ui.notify(`Assigned turn failed: ${message}`, "error");
      this.broker.send({
        type: "client.turn.error",
        turnId: assignment.turnId,
        error: message,
      });
    } finally {
      this.executingTurnId = null;
      this.publishModelState();
      this.updateFooterStatus();
    }
  }

  private currentModelState(): RuntimeModelState {
    const availableModels = this.ctx?.modelRegistry
      .getAvailable()
      .map((model) => ({
        provider: model.provider,
        modelId: model.id,
        name: model.name ?? null,
      })) ?? [];

    const currentModel = this.ctx?.model
      ? {
          provider: this.ctx.model.provider,
          modelId: this.ctx.model.id,
          name: this.ctx.model.name ?? null,
        }
      : null;

    return {
      currentModel,
      availableModels,
      thinkingLevel: this.pi.getThinkingLevel(),
    };
  }

  private publishModelState(): void {
    if (!this.connected || !this.broker) return;
    this.broker.send({
      type: "client.runtime.model_state",
      modelState: this.currentModelState(),
    });
  }

  private installTerminalTypingBridge(ctx: ExtensionContext): void {
    if (!ctx.hasUI) return;
    this.terminalInputUnsubscribe?.();
    this.terminalInputUnsubscribe = ctx.ui.onTerminalInput(() => {
      const text = ctx.ui.getEditorText().trim();
      const shouldType = this.connected && text.length > 0 && !text.startsWith("/") && !text.startsWith("!");
      this.setTyping(shouldType);
      if (shouldType) {
        if (this.typingTimeout) clearTimeout(this.typingTimeout);
        this.typingTimeout = setTimeout(() => this.setTyping(false), 1200);
      }
      return undefined;
    });
  }

  private setTyping(typing: boolean): void {
    if (!this.connected || !this.broker) return;
    if (this.typingTimeout && !typing) {
      clearTimeout(this.typingTimeout);
      this.typingTimeout = undefined;
    }
    this.broker.send({ type: "client.typing", typing });
  }

  private updateFooterStatus(): void {
    this.ctx?.ui.setStatus(
      "advaita",
      formatFooterStatus({
        connected: this.connected,
        sessionName: this.sessionName,
        runtimeId: this.connectionConfig?.runtimeId ?? this.defaultRuntimeId(),
        queuedCount: this.queuedCount,
        currentRuntimeId: this.currentRuntimeId,
        activeTurnId: this.activeTurnId,
        executorRuntimeId: this.executorRuntimeId,
        executorClientId: this.executorClientId,
        executionCwd: this.executionCwd,
        presence: this.presence,
      }),
    );
  }
}

export default function advaitaExtension(pi: ExtensionAPI): void {
  const controller = new AdvaitaExtensionController(pi);
  controller.register();
}
