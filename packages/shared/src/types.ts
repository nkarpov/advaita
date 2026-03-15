import type { AgentSessionEvent, SessionEntry, SessionHeader } from "@mariozechner/pi-coding-agent";

export type ThinkingLevel = "off" | "minimal" | "low" | "medium" | "high" | "xhigh";
export type RuntimeScope = "none" | "turn" | "session";
export type TurnRoutingAction = "execute" | "switch_runtime";
export type TurnRoutingSource = "heuristic" | "llm" | "command";

export interface ModelRef {
  provider: string;
  modelId: string;
  name?: string | null;
}

export interface RuntimeModelState {
  currentModel: ModelRef | null;
  availableModels: ModelRef[];
  thinkingLevel: ThinkingLevel | null;
}

export interface ClientPresence {
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

export interface SessionMetadata {
  name: string;
  createdAt: string;
  updatedAt: string;
  revision: number;
  currentRuntimeId: string | null;
  activeTurnId: string | null;
}

export interface SessionSnapshot {
  header: SessionHeader;
  entries: SessionEntry[];
  metadata: SessionMetadata;
}

export interface TurnRoutingIntent {
  action: TurnRoutingAction;
  requestedRuntimeId: string | null;
  runtimeScope: RuntimeScope;
  requestedModelQuery: string | null;
  executionText: string | null;
  routingSource: TurnRoutingSource;
}

export interface RuntimeResolution {
  executionRuntimeId: string;
  requestedRuntimeId: string | null;
  runtimeScope: RuntimeScope;
  persistedCurrentRuntimeId: string | null;
  source: "explicit" | "current" | "origin";
}

export interface SubmittedTurn {
  turnId: string;
  text: string;
  originClientId: string;
  originRuntimeId: string;
  originCwd: string;
  submittedAt: string;
  requestedRuntimeId: string | null;
  runtimeScope: RuntimeScope;
  requestedModelQuery: string | null;
  executionText: string;
  routingSource: TurnRoutingSource;
}

export interface TurnAssignment extends SubmittedTurn {
  sessionName: string;
  snapshot: SessionSnapshot;
  executionRuntimeId: string;
  executionClientId: string;
  executionCwd: string;
  queuedAt: string;
}

export interface StreamedTurnEvent {
  turnId: string;
  sequence: number;
  runtimeId: string;
  clientId: string;
  executionCwd: string;
  observedAt: string;
  event: AgentSessionEvent;
}

export interface AdvaitaTurnEntryData {
  turnId: string;
  originClientId: string;
  originRuntimeId: string;
  originCwd: string;
  requestedRuntimeId: string | null;
  runtimeScope: RuntimeScope | null;
  requestedModelQuery: string | null;
  routingSource: TurnRoutingSource | null;
  executionRuntimeId: string | null;
  executionClientId: string | null;
  executionCwd: string | null;
  queuedAt: string;
}

export interface TurnCommit {
  turnId: string;
  executionRuntimeId: string;
  executionClientId: string;
  executionCwd: string;
  committedAt: string;
  sessionRevision: number;
  entries: SessionEntry[];
  modelState: RuntimeModelState;
}
