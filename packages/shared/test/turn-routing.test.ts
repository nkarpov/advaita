import { describe, expect, it } from "vitest";
import { extractTurnRoutingIntent, resolveTurnRouting } from "../src/turn-routing.js";

describe("turn routing intent", () => {
  it("extracts runtime and model intent from the same turn", () => {
    expect(extractTurnRoutingIntent("run this on linux using gpt 5", ["mac", "linux"]))
      .toEqual({
        requestedRuntimeId: "linux",
        requestedModelQuery: "gpt 5",
      });
  });

  it("resolves combined runtime routing with sticky fallback", () => {
    expect(
      resolveTurnRouting({
        text: "check the repo and use claude sonnet 4.5",
        originRuntimeId: "mac",
        currentRuntimeId: "linux",
        availableRuntimeIds: ["mac", "linux"],
      }),
    ).toEqual({
      executionRuntimeId: "mac",
      requestedRuntimeId: null,
      requestedModelQuery: "claude sonnet 4.5",
      source: "origin",
    });
  });
});
