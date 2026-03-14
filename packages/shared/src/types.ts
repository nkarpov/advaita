import type { AgentSessionEvent, SessionEntry, SessionHeader } from "@mariozechner/pi-coding-agent";

export type ThinkingLevel = "off" | "minimal" | "low" | "medium" | "high" | "xhigh";

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
  requestedRuntimeId: string | null;
  requestedModelQuery: string | null;
}

export interface RuntimeResolution {
  executionRuntimeId: string;
  requestedRuntimeId: string | null;
  source: "explicit" | "origin" | "current";
}

export interface SubmittedTurn extends TurnRoutingIntent {
  turnId: string;
  text: string;
  originClientId: string;
  originRuntimeId: string;
  originCwd: string;
  submittedAt: string;
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
  requestedModelQuery: string | null;
  executionRuntimeId: string;
  executionClientId: string;
  executionCwd: string;
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
