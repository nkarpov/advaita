import { describe, expect, it } from "vitest";
import { isDeferredSharedSessionCommand, shouldBrokerInput } from "../src/command-classification.js";

describe("command classification", () => {
  it("brokers connected free-text input", () => {
    expect(
      shouldBrokerInput({
        connected: true,
        source: "interactive",
        text: "run this on linux",
        hasImages: false,
      }),
    ).toBe(true);
  });

  it("keeps slash commands, bang commands, and extension-originated input local", () => {
    expect(
      shouldBrokerInput({ connected: true, source: "interactive", text: "/login", hasImages: false }),
    ).toBe(false);
    expect(
      shouldBrokerInput({ connected: true, source: "interactive", text: "!git status", hasImages: false }),
    ).toBe(false);
    expect(
      shouldBrokerInput({ connected: true, source: "extension", text: "run this", hasImages: false }),
    ).toBe(false);
  });

  it("identifies deferred shared-session commands", () => {
    expect(isDeferredSharedSessionCommand("new")).toBe(true);
    expect(isDeferredSharedSessionCommand("resume")).toBe(true);
    expect(isDeferredSharedSessionCommand("fork")).toBe(true);
    expect(isDeferredSharedSessionCommand("tree")).toBe(true);
    expect(isDeferredSharedSessionCommand("login")).toBe(false);
  });
});
