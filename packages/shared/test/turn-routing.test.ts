import { describe, expect, it } from "vitest";
import { extractTurnRoutingIntent, resolveTurnRouting } from "../src/turn-routing.js";

describe("turn routing intent", () => {
  it("extracts runtime and model intent from the same turn", () => {
    expect(extractTurnRoutingIntent("run this on linux using gpt 5", ["mac", "linux"]))
      .toEqual({
        action: "execute",
        requestedRuntimeId: "linux",
        runtimeScope: "turn",
        requestedModelQuery: "gpt 5",
        executionText: "run this on linux using gpt 5",
        routingSource: "heuristic",
      });
  });

  it("treats switch-to phrasing as a sticky runtime change plus execution without rewriting the text", () => {
    expect(extractTurnRoutingIntent("switch to linux and inspect the repo", ["mac", "linux"]))
      .toEqual({
        action: "execute",
        requestedRuntimeId: "linux",
        runtimeScope: "session",
        requestedModelQuery: null,
        executionText: "switch to linux and inspect the repo",
        routingSource: "heuristic",
      });
  });

  it("detects pure sticky runtime switches with no execution payload", () => {
    expect(extractTurnRoutingIntent("switch to linux", ["mac", "linux"]))
      .toEqual({
        action: "switch_runtime",
        requestedRuntimeId: "linux",
        runtimeScope: "session",
        requestedModelQuery: null,
        executionText: null,
        routingSource: "heuristic",
      });
  });

  it("maps local aliases onto the submitting runtime", () => {
    expect(extractTurnRoutingIntent("switch to local", ["mac", "linux"], "linux"))
      .toEqual({
        action: "switch_runtime",
        requestedRuntimeId: "linux",
        runtimeScope: "session",
        requestedModelQuery: null,
        executionText: null,
        routingSource: "heuristic",
      });
  });

  it("resolves execute intents against the sticky current runtime before origin", () => {
    expect(
      resolveTurnRouting({
        requestedRuntimeId: null,
        runtimeScope: "none",
        requestedModelQuery: "claude sonnet 4.5",
        executionText: "check the repo",
        routingSource: "heuristic",
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
      requestedModelQuery: "claude sonnet 4.5",
      executionText: "check the repo",
      routingSource: "heuristic",
    });
  });
});
