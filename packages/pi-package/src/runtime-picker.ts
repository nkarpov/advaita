import type { ClientPresence } from "@advaita/shared";
import type { Theme } from "@mariozechner/pi-coding-agent";
import { matchesKey, truncateToWidth, visibleWidth, type Component } from "@mariozechner/pi-tui";

export const RUNTIME_PICKER_SHORTCUT = "ctrl+r";

export interface RuntimePickerOption {
  runtimeId: string;
  displayName: string;
  modelLabel: string | null;
  isLocal: boolean;
  isDefault: boolean;
  isExecuting: boolean;
}

export interface BuildRuntimePickerOptionsInput {
  presence: ClientPresence[];
  localRuntimeId: string;
  currentRuntimeId: string | null;
  executorRuntimeId: string | null;
}

function formatModelLabel(presence: ClientPresence): string | null {
  const model = presence.modelState.currentModel;
  if (!model) {
    return null;
  }
  return model.name ?? model.modelId;
}

function comparePresence(left: ClientPresence, right: ClientPresence, localRuntimeId: string): number {
  const leftLocal = left.runtimeId === localRuntimeId;
  const rightLocal = right.runtimeId === localRuntimeId;
  if (leftLocal !== rightLocal) {
    return leftLocal ? -1 : 1;
  }
  return right.lastSeenAt.localeCompare(left.lastSeenAt);
}

export function buildRuntimePickerOptions(input: BuildRuntimePickerOptionsInput): RuntimePickerOption[] {
  const preferredByRuntimeId = new Map<string, ClientPresence>();

  for (const candidate of input.presence) {
    const existing = preferredByRuntimeId.get(candidate.runtimeId);
    if (!existing || comparePresence(candidate, existing, input.localRuntimeId) < 0) {
      preferredByRuntimeId.set(candidate.runtimeId, candidate);
    }
  }

  const defaultRuntimeId = input.currentRuntimeId ?? input.localRuntimeId;

  return Array.from(preferredByRuntimeId.values())
    .map((presence) => ({
      runtimeId: presence.runtimeId,
      displayName: presence.displayName,
      modelLabel: formatModelLabel(presence),
      isLocal: presence.runtimeId === input.localRuntimeId,
      isDefault: presence.runtimeId === defaultRuntimeId,
      isExecuting: presence.runtimeId === input.executorRuntimeId,
    }))
    .sort((left, right) => {
      if (left.isDefault !== right.isDefault) {
        return left.isDefault ? -1 : 1;
      }
      if (left.isLocal !== right.isLocal) {
        return left.isLocal ? -1 : 1;
      }
      return left.runtimeId.localeCompare(right.runtimeId);
    });
}

export function getInitialRuntimePickerIndex(options: RuntimePickerOption[]): number {
  const defaultIndex = options.findIndex((option) => option.isDefault);
  if (defaultIndex >= 0) {
    return defaultIndex;
  }
  const localIndex = options.findIndex((option) => option.isLocal);
  if (localIndex >= 0) {
    return localIndex;
  }
  return 0;
}

function nextIndex(current: number, length: number, delta: number): number {
  if (length === 0) {
    return 0;
  }
  return (current + delta + length) % length;
}

function formatHotkeyLabel(hotkey: string): string {
  return hotkey
    .split("+")
    .map((segment) => segment.length <= 1 ? segment.toUpperCase() : `${segment[0]!.toUpperCase()}${segment.slice(1)}`)
    .join("+");
}

function padVisible(line: string, width: number): string {
  const missing = Math.max(0, width - visibleWidth(line));
  return line + " ".repeat(missing);
}

function frameLine(theme: Theme, left: string, content: string, right: string, innerWidth: number, bg: "customMessageBg" | "selectedBg"): string {
  return theme.fg("accent", left) + theme.bg(bg, padVisible(content, innerWidth)) + theme.fg("accent", right);
}

function formatOptionLine(theme: Theme, option: RuntimePickerOption, isSelected: boolean, width: number): string {
  const cursor = isSelected ? theme.fg("accent", "› ") : "  ";
  const badges = [
    option.isDefault ? "default" : null,
    option.isExecuting ? "executing" : null,
    option.isLocal ? "local" : null,
  ].filter(Boolean);
  const detailParts = [option.displayName !== option.runtimeId ? option.displayName : null, option.modelLabel, ...badges];
  const detail = detailParts.filter(Boolean).join(" · ");
  let line = cursor + option.runtimeId;
  if (detail.length > 0) {
    line += theme.fg("dim", ` · ${detail}`);
  }
  if (isSelected) {
    line = theme.bold(line);
  }
  return truncateToWidth(line, width);
}

export class RuntimePickerComponent implements Component {
  private selectedIndex: number;

  constructor(
    private readonly theme: Theme,
    private readonly options: RuntimePickerOption[],
    onDone: (runtimeId: string | undefined) => void,
  ) {
    this.selectedIndex = getInitialRuntimePickerIndex(options);
    this.onDone = onDone;
  }

  private readonly onDone: (runtimeId: string | undefined) => void;

  handleInput(data: string): void {
    if (matchesKey(data, RUNTIME_PICKER_SHORTCUT) || matchesKey(data, "down")) {
      this.selectedIndex = nextIndex(this.selectedIndex, this.options.length, 1);
      return;
    }
    if (matchesKey(data, "up")) {
      this.selectedIndex = nextIndex(this.selectedIndex, this.options.length, -1);
      return;
    }
    if (matchesKey(data, "enter") || matchesKey(data, "return")) {
      this.onDone(this.options[this.selectedIndex]?.runtimeId);
      return;
    }
    if (matchesKey(data, "escape") || matchesKey(data, "ctrl+c")) {
      this.onDone(undefined);
    }
  }

  invalidate(): void {}

  render(width: number): string[] {
    const safeWidth = Math.max(28, width);
    const innerWidth = Math.max(24, Math.min(safeWidth - 2, 72));
    const contentWidth = Math.max(20, innerWidth - 2);
    const rawLines = [
      this.theme.bold(this.theme.fg("accent", " Switch default runtime ")),
      this.theme.fg(
        "dim",
        ` Enter select · Esc cancel · ${formatHotkeyLabel(RUNTIME_PICKER_SHORTCUT)} cycle `,
      ),
      "",
    ];

    if (this.options.length === 0) {
      rawLines.push(this.theme.fg("dim", " No connected runtimes. "));
    } else {
      for (let index = 0; index < this.options.length; index++) {
        rawLines.push(formatOptionLine(this.theme, this.options[index]!, index === this.selectedIndex, contentWidth));
      }
    }

    const measuredWidth = Math.max(...rawLines.map((line) => visibleWidth(line)), 0);
    const panelInnerWidth = Math.max(24, Math.min(contentWidth, measuredWidth));
    const top = this.theme.fg("accent", `┌${"─".repeat(panelInnerWidth)}┐`);
    const bottom = this.theme.fg("accent", `└${"─".repeat(panelInnerWidth)}┘`);
    const lines = [top];

    for (let index = 0; index < rawLines.length; index++) {
      const line = truncateToWidth(rawLines[index]!, panelInnerWidth);
      const isSelectedOption = this.options.length > 0 && index >= 3 && (index - 3) === this.selectedIndex;
      lines.push(frameLine(this.theme, "│", line, "│", panelInnerWidth, isSelectedOption ? "selectedBg" : "customMessageBg"));
    }

    lines.push(bottom);
    return lines.map((line) => truncateToWidth(line, safeWidth));
  }
}
