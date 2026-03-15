import { describe, expect, it } from "vitest";
import { parseRequestedRuntime, parseRequestedRuntimeDirective, resolveExecutionRuntime } from "../src/runtime-routing.js";

describe("runtime routing", () => {
  it("detects explicit run-as runtime as a one-turn override", () => {
    expect(parseRequestedRuntimeDirective("run this as mac and inspect Xcode", ["mac", "linux"]))
      .toEqual({
        requestedRuntimeId: "mac",
        runtimeScope: "turn",
      });
  });

  it("detects sticky runtime switch phrasing", () => {
    expect(parseRequestedRuntimeDirective("okay ur now on linux and run tcpdump", ["mac", "linux"]))
      .toEqual({
        requestedRuntimeId: "linux",
        runtimeScope: "session",
      });
  });

  it("detects run-in runtime phrasing", () => {
    expect(parseRequestedRuntime("run ls in linux", ["mac", "linux"]))
      .toBe("linux");
  });

  it("detects slash runtime commands as sticky switches", () => {
    expect(parseRequestedRuntimeDirective("/runtime linux", ["mac", "linux"]))
      .toEqual({
        requestedRuntimeId: "linux",
        runtimeScope: "session",
      });
  });

  it("resolves origin-relative local aliases to the submitting runtime", () => {
    expect(parseRequestedRuntimeDirective("switch to local", ["mac", "linux"], "linux"))
      .toEqual({
        requestedRuntimeId: "linux",
        runtimeScope: "session",
      });
    expect(parseRequestedRuntimeDirective("run this locally", ["mac", "linux"], "linux"))
      .toEqual({
        requestedRuntimeId: "linux",
        runtimeScope: "turn",
      });
  });

  it("uses the shared current runtime before origin when there is no explicit runtime", () => {
    expect(
      resolveExecutionRuntime({
        requestedRuntimeId: null,
        runtimeScope: "none",
        originRuntimeId: "mac",
        currentRuntimeId: "linux",
        availableRuntimeIds: ["mac", "linux"],
      }),
    ).toEqual({
      executionRuntimeId: "linux",
      requestedRuntimeId: null,
      runtimeScope: "none",
      persistedCurrentRuntimeId: "linux",
      source: "current",
    });
  });

  it("keeps one-turn explicit runtime routing from changing the sticky current runtime", () => {
    expect(
      resolveExecutionRuntime({
        requestedRuntimeId: "mac",
        runtimeScope: "turn",
        originRuntimeId: "linux",
        currentRuntimeId: "linux",
        availableRuntimeIds: ["mac", "linux"],
      }),
    ).toEqual({
      executionRuntimeId: "mac",
      requestedRuntimeId: "mac",
      runtimeScope: "turn",
      persistedCurrentRuntimeId: "linux",
      source: "explicit",
    });
  });

  it("persists sticky runtime switches to the requested runtime", () => {
    expect(
      resolveExecutionRuntime({
        requestedRuntimeId: "linux",
        runtimeScope: "session",
        originRuntimeId: "mac",
        currentRuntimeId: "mac",
        availableRuntimeIds: ["mac", "linux"],
      }),
    ).toEqual({
      executionRuntimeId: "linux",
      requestedRuntimeId: "linux",
      runtimeScope: "session",
      persistedCurrentRuntimeId: "linux",
      source: "explicit",
    });
  });

  it("bootstraps the sticky runtime from the origin runtime when the session has none yet", () => {
    expect(
      resolveExecutionRuntime({
        requestedRuntimeId: null,
        runtimeScope: "none",
        originRuntimeId: "mac",
        currentRuntimeId: null,
        availableRuntimeIds: ["mac", "linux"],
      }),
    ).toEqual({
      executionRuntimeId: "mac",
      requestedRuntimeId: null,
      runtimeScope: "none",
      persistedCurrentRuntimeId: "mac",
      source: "origin",
    });
  });
});
