import { describe, expect, it } from "vitest";
import { parseRequestedRuntime, resolveExecutionRuntime } from "../src/runtime-routing.js";

describe("runtime routing", () => {
  it("detects explicit run-as runtime", () => {
    expect(parseRequestedRuntime("run this as mac and inspect Xcode", ["mac", "linux"]))
      .toBe("mac");
  });

  it("detects explicit switch phrasing", () => {
    expect(parseRequestedRuntime("okay ur now on linux and run tcpdump", ["mac", "linux"]))
      .toBe("linux");
  });

  it("detects run-in runtime phrasing", () => {
    expect(parseRequestedRuntime("run ls in linux", ["mac", "linux"]))
      .toBe("linux");
  });

  it("detects slash commands", () => {
    expect(parseRequestedRuntime("/runtime linux", ["mac", "linux"]))
      .toBe("linux");
  });

  it("falls back to origin runtime", () => {
    expect(
      resolveExecutionRuntime({
        text: "check the repo status",
        originRuntimeId: "linux",
        currentRuntimeId: "mac",
        availableRuntimeIds: ["mac", "linux"],
      }),
    ).toEqual({
      executionRuntimeId: "linux",
      requestedRuntimeId: null,
      source: "origin",
    });
  });

  it("uses explicit runtime over origin runtime", () => {
    expect(
      resolveExecutionRuntime({
        text: "run as mac and inspect the app bundle",
        originRuntimeId: "linux",
        currentRuntimeId: "linux",
        availableRuntimeIds: ["mac", "linux"],
      }),
    ).toEqual({
      executionRuntimeId: "mac",
      requestedRuntimeId: "mac",
      source: "explicit",
    });
  });
});
