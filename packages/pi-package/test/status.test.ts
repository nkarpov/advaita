import { describe, expect, it } from "vitest";
import { formatFooterStatus, formatRuntimeWidget } from "../src/status.js";

describe("status formatting", () => {
  it("clears the footer when disconnected", () => {
    expect(
      formatFooterStatus({
        connected: false,
        sessionName: null,
        runtimeId: "mac",
        queuedCount: 0,
        currentRuntimeId: null,
        activeTurnId: null,
        executorRuntimeId: null,
        executorClientId: null,
        executionCwd: null,
        presence: [],
        attuningIndicator: null,
      }),
    ).toBeUndefined();
  });

  it("keeps the footer clear even when connected", () => {
    expect(
      formatFooterStatus({
        connected: true,
        sessionName: "demo",
        runtimeId: "mac",
        queuedCount: 0,
        currentRuntimeId: "linux",
        activeTurnId: null,
        executorRuntimeId: null,
        executorClientId: null,
        executionCwd: null,
        presence: [],
        attuningIndicator: null,
      }),
    ).toBeUndefined();
  });

  it("renders the runtime indicator near the input with session, current runtime, and local runtime", () => {
    expect(
      formatRuntimeWidget({
        connected: true,
        sessionName: "demo",
        runtimeId: "linux",
        queuedCount: 0,
        currentRuntimeId: "mac",
        activeTurnId: null,
        executorRuntimeId: null,
        executorClientId: null,
        executionCwd: null,
        presence: [],
        attuningIndicator: null,
      }),
    ).toEqual(["advaita(#demo) · current: mac · local: linux"]);
  });

  it("shows the sticky default separately during a one-turn remote execution override", () => {
    expect(
      formatRuntimeWidget({
        connected: true,
        sessionName: "demo",
        runtimeId: "linux",
        queuedCount: 2,
        currentRuntimeId: "linux",
        activeTurnId: "turn-1",
        executorRuntimeId: "mac",
        executorClientId: "client-mac",
        executionCwd: "/Users/nickkarpov/advaita",
        presence: [],
        attuningIndicator: null,
      }),
    ).toEqual(["advaita(#demo) · current: mac · local: linux · default: linux · queue: 2"]);
  });

  it("shows an attuning indicator while the router is deciding", () => {
    expect(
      formatRuntimeWidget({
        connected: true,
        sessionName: "demo",
        runtimeId: "linux",
        queuedCount: 0,
        currentRuntimeId: "linux",
        activeTurnId: null,
        executorRuntimeId: null,
        executorClientId: null,
        executionCwd: null,
        presence: [],
        attuningIndicator: "⠋ Attuning...",
      }),
    ).toEqual(["advaita(#demo) · current: linux · local: linux", "⠋ Attuning..."]);
  });
});
