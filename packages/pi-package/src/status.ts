import type { ClientPresence } from "@advaita/shared";

export interface AdvaitaStatusState {
  connected: boolean;
  sessionName: string | null;
  runtimeId: string;
  queuedCount: number;
  currentRuntimeId: string | null;
  activeTurnId: string | null;
  executorRuntimeId: string | null;
  executorClientId: string | null;
  executionCwd: string | null;
  presence: ClientPresence[];
  attuningIndicator?: string | null;
}

function resolveCurrentExecutionRuntime(state: AdvaitaStatusState): string {
  return state.executorRuntimeId ?? state.currentRuntimeId ?? state.runtimeId;
}

function resolveDefaultRuntime(state: AdvaitaStatusState): string {
  return state.currentRuntimeId ?? state.runtimeId;
}

export function formatFooterStatus(_state: AdvaitaStatusState): string | undefined {
  return undefined;
}

export function formatRuntimeWidget(state: AdvaitaStatusState): string[] | undefined {
  if (!state.connected || !state.sessionName) {
    return undefined;
  }

  const current = resolveCurrentExecutionRuntime(state);
  const local = state.runtimeId;
  const defaultRuntime = resolveDefaultRuntime(state);
  const parts = [
    `advaita(#${state.sessionName})`,
    `current: ${current}`,
    `local: ${local}`,
  ];

  if (state.activeTurnId && current !== defaultRuntime) {
    parts.push(`default: ${defaultRuntime}`);
  }

  if (state.queuedCount > 0) {
    parts.push(`queue: ${state.queuedCount}`);
  }

  const lines = [parts.join(" · ")];
  if (state.attuningIndicator) {
    lines.push(state.attuningIndicator);
  }
  return lines;
}
