import type { ClientPresence } from "@advaita/shared";

export interface AdvaitaFooterState {
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
}

function formatPresence(presence: ClientPresence[]): string {
  if (presence.length === 0) return "no peers";
  return presence
    .map((client) => {
      const model = client.modelState.currentModel?.modelId ?? "default";
      const suffix = [client.executing ? "exec" : null, client.typing ? "typing" : null].filter(Boolean).join(",",
      );
      return `${client.runtimeId}:${model}${suffix ? `(${suffix})` : ""}`;
    })
    .join(" ");
}

export function formatFooterStatus(state: AdvaitaFooterState): string {
  if (!state.connected || !state.sessionName) {
    return `off • ${state.runtimeId}`;
  }

  const execution = state.executorRuntimeId
    ? `exec=${state.executorRuntimeId}${state.executorClientId ? `@${state.executorClientId}` : ""}${state.executionCwd ? `:${state.executionCwd}` : ""}`
    : "exec=idle";

  return [
    `session=${state.sessionName}`,
    `runtime=${state.runtimeId}`,
    `current=${state.currentRuntimeId ?? "none"}`,
    `turn=${state.activeTurnId ?? "idle"}`,
    `queue=${state.queuedCount}`,
    execution,
    formatPresence(state.presence),
  ].join(" • ");
}
