import { randomUUID } from "node:crypto";
import type {
  BrokerMessage,
  ClientMessage,
  ClientPresence,
  RuntimeModelState,
  SessionSnapshot,
  StreamedTurnEvent,
  SubmittedTurn,
  TurnAssignment,
  TurnCommit,
} from "@advaita/shared";
import { extractTurnRoutingIntent, resolveTurnRouting, type AdvaitaTurnEntryData } from "@advaita/shared";
import { SessionStore } from "./session-store.js";
import {
  createAdvaitaTurnEntry,
  createAssistantErrorEntry,
  createMessageEntry,
  lastEntryId,
} from "./session-entries.js";

export interface BrokerConnection {
  sessionName: string;
  clientId: string;
}

export type BrokerSink = (message: BrokerMessage) => void;

export interface AdvaitaBrokerOptions {
  dataDir: string;
  now?: () => string;
  createTurnId?: () => string;
}

interface ConnectedClient {
  sink: BrokerSink;
  sessionName: string;
  clientId: string;
  runtimeId: string;
  displayName: string;
  cwd: string;
  connectedAt: string;
  lastSeenAt: string;
  typing: boolean;
  executing: boolean;
  modelState: RuntimeModelState;
}

interface QueuedTurn {
  submitted: SubmittedTurn;
  alreadyCommitted: boolean;
}

interface ActiveTurn {
  assignment: TurnAssignment;
  nextSequence: number;
}

interface SessionRuntimeState {
  clients: Map<string, ConnectedClient>;
  queue: QueuedTurn[];
  activeTurn: ActiveTurn | null;
}

function assignmentToSubmitted(assignment: TurnAssignment): SubmittedTurn {
  return {
    turnId: assignment.turnId,
    text: assignment.text,
    originClientId: assignment.originClientId,
    originRuntimeId: assignment.originRuntimeId,
    originCwd: assignment.originCwd,
    submittedAt: assignment.submittedAt,
    requestedRuntimeId: assignment.requestedRuntimeId,
    requestedModelQuery: assignment.requestedModelQuery,
  };
}

export class AdvaitaBroker {
  private readonly now: () => string;
  private readonly createTurnId: () => string;
  private readonly store: SessionStore;
  private readonly sessionStates = new Map<string, SessionRuntimeState>();

  constructor(options: AdvaitaBrokerOptions) {
    this.now = options.now ?? (() => new Date().toISOString());
    this.createTurnId = options.createTurnId ?? randomUUID;
    this.store = new SessionStore({ rootDir: options.dataDir, now: this.now });
  }

  connectClient(message: Extract<ClientMessage, { type: "client.hello" }>, sink: BrokerSink): BrokerConnection {
    const state = this.getSessionState(message.sessionName);
    const existing = state.clients.get(message.clientId);
    const connectedAt = existing?.connectedAt ?? this.now();
    const client: ConnectedClient = {
      sink,
      sessionName: message.sessionName,
      clientId: message.clientId,
      runtimeId: message.runtimeId,
      displayName: message.displayName,
      cwd: message.cwd,
      connectedAt,
      lastSeenAt: this.now(),
      typing: false,
      executing: state.activeTurn?.assignment.executionClientId === message.clientId,
      modelState: structuredClone(message.modelState),
    };
    state.clients.set(client.clientId, client);

    const snapshot = this.store.load(message.sessionName);
    this.send(client, {
      type: "broker.snapshot",
      session: snapshot,
      presence: this.getPresence(message.sessionName),
      queuedCount: state.queue.length,
      activeTurnId: state.activeTurn?.assignment.turnId ?? null,
      executorRuntimeId: state.activeTurn?.assignment.executionRuntimeId ?? null,
      executorClientId: state.activeTurn?.assignment.executionClientId ?? null,
      executionCwd: state.activeTurn?.assignment.executionCwd ?? null,
    });

    this.broadcastPresence(message.sessionName);
    this.startNextTurn(message.sessionName);
    return { sessionName: message.sessionName, clientId: message.clientId };
  }

  disconnectClient(connection: BrokerConnection): void {
    const state = this.getSessionState(connection.sessionName);
    const client = state.clients.get(connection.clientId);
    if (!client) {
      return;
    }

    state.clients.delete(connection.clientId);

    if (state.activeTurn?.assignment.executionClientId === connection.clientId) {
      const { assignment } = state.activeTurn;
      state.activeTurn = null;
      this.store.updateMetadata(connection.sessionName, { activeTurnId: null });
      state.queue.unshift({
        submitted: assignmentToSubmitted(assignment),
        alreadyCommitted: true,
      });
      this.broadcast(connection.sessionName, {
        type: "broker.notice",
        level: "warning",
        message: `Executor ${client.runtimeId} disconnected; reassigning active turn ${assignment.turnId}.`,
      });
    }

    this.broadcastPresence(connection.sessionName);
    this.broadcastTurnState(connection.sessionName);
    this.startNextTurn(connection.sessionName);
  }

  handleClientMessage(connection: BrokerConnection, message: Exclude<ClientMessage, { type: "client.hello" }>): void {
    const client = this.getClient(connection);
    if (!client) {
      throw new Error(`Unknown client ${connection.clientId} for session ${connection.sessionName}`);
    }

    client.lastSeenAt = this.now();

    switch (message.type) {
      case "client.submit": {
        const state = this.getSessionState(connection.sessionName);
        state.queue.push({
          submitted: {
            turnId: this.createTurnId(),
            text: message.text,
            originClientId: client.clientId,
            originRuntimeId: client.runtimeId,
            originCwd: client.cwd,
            submittedAt: this.now(),
            ...this.extractRoutingIntent(message.text, connection.sessionName),
          },
          alreadyCommitted: false,
        });
        this.broadcastPresence(connection.sessionName);
        this.broadcastTurnState(connection.sessionName);
        this.startNextTurn(connection.sessionName);
        break;
      }
      case "client.typing": {
        client.typing = message.typing;
        this.broadcastPresence(connection.sessionName);
        break;
      }
      case "client.switch_runtime": {
        this.handleRuntimeSwitch(connection.sessionName, client, message.runtimeId);
        break;
      }
      case "client.runtime.model_state": {
        client.modelState = structuredClone(message.modelState);
        this.broadcastPresence(connection.sessionName);
        break;
      }
      case "client.turn.stream": {
        const state = this.getSessionState(connection.sessionName);
        const activeTurn = state.activeTurn;
        if (!activeTurn || activeTurn.assignment.executionClientId !== client.clientId) {
          return;
        }
        const stream: StreamedTurnEvent = {
          turnId: activeTurn.assignment.turnId,
          sequence: activeTurn.nextSequence++,
          runtimeId: activeTurn.assignment.executionRuntimeId,
          clientId: activeTurn.assignment.executionClientId,
          executionCwd: activeTurn.assignment.executionCwd,
          observedAt: this.now(),
          event: message.stream.event,
        };
        this.broadcast(connection.sessionName, {
          type: "broker.turn.stream",
          stream,
        });
        break;
      }
      case "client.turn.commit": {
        this.handleTurnCommit(connection.sessionName, client, message.commit);
        break;
      }
      case "client.turn.error": {
        this.handleTurnError(connection.sessionName, client, message.turnId, message.error);
        break;
      }
    }
  }

  loadSession(sessionName: string): SessionSnapshot {
    return this.store.load(sessionName);
  }

  getPresence(sessionName: string): ClientPresence[] {
    return Array.from(this.getSessionState(sessionName).clients.values())
      .map((client) => ({
        clientId: client.clientId,
        runtimeId: client.runtimeId,
        displayName: client.displayName,
        cwd: client.cwd,
        connectedAt: client.connectedAt,
        lastSeenAt: client.lastSeenAt,
        typing: client.typing,
        executing: client.executing,
        modelState: structuredClone(client.modelState),
      }))
      .sort((a, b) => a.displayName.localeCompare(b.displayName));
  }

  getQueuedCount(sessionName: string): number {
    return this.getSessionState(sessionName).queue.length;
  }

  getActiveTurn(sessionName: string): TurnAssignment | null {
    return this.getSessionState(sessionName).activeTurn?.assignment ?? null;
  }

  private extractRoutingIntent(text: string, sessionName: string): Pick<SubmittedTurn, "requestedRuntimeId" | "requestedModelQuery"> {
    const availableRuntimeIds = Array.from(this.getSessionState(sessionName).clients.values()).map((client) => client.runtimeId);
    return extractTurnRoutingIntent(text, availableRuntimeIds);
  }

  private startNextTurn(sessionName: string): void {
    const state = this.getSessionState(sessionName);
    if (state.activeTurn || state.queue.length === 0) {
      return;
    }

    const queued = state.queue[0]!;
    const snapshot = this.store.load(sessionName);
    const availableRuntimeIds = Array.from(state.clients.values()).map((client) => client.runtimeId);

    let resolution;
    try {
      resolution = resolveTurnRouting({
        text: queued.submitted.text,
        originRuntimeId: queued.submitted.originRuntimeId,
        currentRuntimeId: snapshot.metadata.currentRuntimeId,
        availableRuntimeIds,
      });
    } catch {
      this.broadcast(sessionName, {
        type: "broker.notice",
        level: "warning",
        message: "No execution runtime is currently available for the queued turn.",
      });
      return;
    }

    const executor = this.chooseExecutor(sessionName, resolution.executionRuntimeId, queued.submitted.originClientId);
    if (!executor) {
      this.broadcast(sessionName, {
        type: "broker.notice",
        level: "warning",
        message: `Runtime ${resolution.executionRuntimeId} is not connected yet; keeping turn queued.`,
      });
      return;
    }

    state.queue.shift();

    let assignmentSnapshot = snapshot;
    if (!queued.alreadyCommitted) {
      const turnData: AdvaitaTurnEntryData = {
        turnId: queued.submitted.turnId,
        originClientId: queued.submitted.originClientId,
        originRuntimeId: queued.submitted.originRuntimeId,
        originCwd: queued.submitted.originCwd,
        requestedRuntimeId: resolution.requestedRuntimeId,
        requestedModelQuery: queued.submitted.requestedModelQuery,
        executionRuntimeId: resolution.executionRuntimeId,
        executionClientId: executor.clientId,
        executionCwd: executor.cwd,
        queuedAt: queued.submitted.submittedAt,
      };
      const turnEntry = createAdvaitaTurnEntry(turnData, lastEntryId(snapshot.entries));
      const userEntry = createMessageEntry(
        {
          role: "user",
          content: queued.submitted.text,
          timestamp: Date.now(),
        },
        turnEntry.id,
      );
      assignmentSnapshot = this.store.appendEntries(sessionName, [turnEntry, userEntry], {
        currentRuntimeId: resolution.executionRuntimeId,
        activeTurnId: queued.submitted.turnId,
      });
      this.broadcast(sessionName, {
        type: "broker.session.entries",
        entries: [turnEntry, userEntry],
        metadata: assignmentSnapshot.metadata,
      });
    } else {
      assignmentSnapshot = this.store.updateMetadata(sessionName, {
        currentRuntimeId: resolution.executionRuntimeId,
        activeTurnId: queued.submitted.turnId,
      });
    }

    const assignment: TurnAssignment = {
      ...queued.submitted,
      sessionName,
      requestedRuntimeId: resolution.requestedRuntimeId,
      requestedModelQuery: queued.submitted.requestedModelQuery,
      snapshot: assignmentSnapshot,
      executionRuntimeId: resolution.executionRuntimeId,
      executionClientId: executor.clientId,
      executionCwd: executor.cwd,
      queuedAt: queued.submitted.submittedAt,
    };

    executor.executing = true;
    executor.typing = false;
    state.activeTurn = {
      assignment,
      nextSequence: 0,
    };

    this.broadcastTurnState(sessionName);
    this.broadcastPresence(sessionName);
    this.send(executor, {
      type: "broker.turn.assigned",
      assignment,
    });
  }

  private handleRuntimeSwitch(sessionName: string, _client: ConnectedClient, runtimeId: string): void {
    const state = this.getSessionState(sessionName);
    const hasRuntime = Array.from(state.clients.values()).some((candidate) => candidate.runtimeId === runtimeId);
    if (!hasRuntime) {
      this.broadcast(sessionName, {
        type: "broker.notice",
        level: "warning",
        message: `Runtime ${runtimeId} is not connected.`,
      });
      return;
    }

    this.store.updateMetadata(sessionName, { currentRuntimeId: runtimeId });
    this.broadcastTurnState(sessionName);
    this.broadcast(sessionName, {
      type: "broker.notice",
      level: "info",
      message: `Runtime switched to ${runtimeId}`,
    });
  }

  private handleTurnCommit(sessionName: string, client: ConnectedClient, commit: TurnCommit): void {
    const state = this.getSessionState(sessionName);
    const activeTurn = state.activeTurn;
    if (!activeTurn || activeTurn.assignment.executionClientId !== client.clientId) {
      return;
    }
    if (activeTurn.assignment.turnId !== commit.turnId) {
      return;
    }

    const updatedSnapshot = this.store.appendEntries(sessionName, commit.entries, {
      currentRuntimeId: activeTurn.assignment.executionRuntimeId,
      activeTurnId: null,
    });

    client.executing = false;
    client.modelState = structuredClone(commit.modelState);
    state.activeTurn = null;

    const canonicalCommit: TurnCommit = {
      turnId: activeTurn.assignment.turnId,
      executionRuntimeId: activeTurn.assignment.executionRuntimeId,
      executionClientId: activeTurn.assignment.executionClientId,
      executionCwd: activeTurn.assignment.executionCwd,
      committedAt: this.now(),
      sessionRevision: updatedSnapshot.metadata.revision,
      entries: structuredClone(commit.entries),
      modelState: structuredClone(commit.modelState),
    };

    this.broadcast(sessionName, {
      type: "broker.session.commit",
      commit: canonicalCommit,
      metadata: updatedSnapshot.metadata,
    });
    this.broadcastTurnState(sessionName);
    this.broadcastPresence(sessionName);
    this.startNextTurn(sessionName);
  }

  private handleTurnError(sessionName: string, client: ConnectedClient, turnId: string, error: string): void {
    const state = this.getSessionState(sessionName);
    const activeTurn = state.activeTurn;
    if (!activeTurn || activeTurn.assignment.executionClientId !== client.clientId) {
      return;
    }
    if (activeTurn.assignment.turnId !== turnId) {
      return;
    }

    const errorEntry = createAssistantErrorEntry(error, this.store.getLeafId(sessionName));
    const updatedSnapshot = this.store.appendEntries(sessionName, [errorEntry], {
      currentRuntimeId: activeTurn.assignment.executionRuntimeId,
      activeTurnId: null,
    });

    client.executing = false;
    state.activeTurn = null;

    const canonicalCommit: TurnCommit = {
      turnId: activeTurn.assignment.turnId,
      executionRuntimeId: activeTurn.assignment.executionRuntimeId,
      executionClientId: activeTurn.assignment.executionClientId,
      executionCwd: activeTurn.assignment.executionCwd,
      committedAt: this.now(),
      sessionRevision: updatedSnapshot.metadata.revision,
      entries: [errorEntry],
      modelState: structuredClone(client.modelState),
    };

    this.broadcast(sessionName, {
      type: "broker.session.commit",
      commit: canonicalCommit,
      metadata: updatedSnapshot.metadata,
    });
    this.broadcast(sessionName, {
      type: "broker.notice",
      level: "error",
      message: `Turn ${turnId} failed on ${client.runtimeId}: ${error}`,
    });
    this.broadcastTurnState(sessionName);
    this.broadcastPresence(sessionName);
    this.startNextTurn(sessionName);
  }

  private broadcastPresence(sessionName: string): void {
    const state = this.getSessionState(sessionName);
    this.broadcast(sessionName, {
      type: "broker.presence",
      presence: this.getPresence(sessionName),
      queuedCount: state.queue.length,
      activeTurnId: state.activeTurn?.assignment.turnId ?? null,
    });
  }

  private broadcastTurnState(sessionName: string): void {
    const state = this.getSessionState(sessionName);
    const snapshot = this.store.load(sessionName);
    this.broadcast(sessionName, {
      type: "broker.turn.state",
      activeTurnId: state.activeTurn?.assignment.turnId ?? null,
      queuedCount: state.queue.length,
      currentRuntimeId: snapshot.metadata.currentRuntimeId,
      executorRuntimeId: state.activeTurn?.assignment.executionRuntimeId ?? null,
      executorClientId: state.activeTurn?.assignment.executionClientId ?? null,
      executionCwd: state.activeTurn?.assignment.executionCwd ?? null,
    });
  }

  private chooseExecutor(sessionName: string, runtimeId: string, preferredClientId: string | null): ConnectedClient | null {
    const candidates = Array.from(this.getSessionState(sessionName).clients.values()).filter(
      (client) => client.runtimeId === runtimeId,
    );
    if (candidates.length === 0) {
      return null;
    }
    const preferred = preferredClientId ? candidates.find((candidate) => candidate.clientId === preferredClientId) : undefined;
    if (preferred) {
      return preferred;
    }
    candidates.sort((a, b) => b.lastSeenAt.localeCompare(a.lastSeenAt));
    return candidates[0] ?? null;
  }

  private getSessionState(sessionName: string): SessionRuntimeState {
    let state = this.sessionStates.get(sessionName);
    if (!state) {
      state = {
        clients: new Map(),
        queue: [],
        activeTurn: null,
      };
      this.sessionStates.set(sessionName, state);
    }
    return state;
  }

  private getClient(connection: BrokerConnection): ConnectedClient | null {
    return this.getSessionState(connection.sessionName).clients.get(connection.clientId) ?? null;
  }

  private broadcast(sessionName: string, message: BrokerMessage): void {
    for (const client of this.getSessionState(sessionName).clients.values()) {
      this.send(client, message);
    }
  }

  private send(client: ConnectedClient, message: BrokerMessage): void {
    client.sink(message);
  }
}
