import { describe, expect, it } from "vitest";
import { defaultSessionName, generateFriendlySessionName, normalizeBrokerUrl, parseCliArgs } from "../src/args.js";

describe("launcher args", () => {
  it("uses the cwd basename as the join fallback session name", () => {
    expect(defaultSessionName("/Users/nickkarpov/advaita")).toBe("advaita");
  });

  it("generates friendly random session names", () => {
    expect(generateFriendlySessionName((max) => max - 1)).toBe("pine-tidal-zzz");
  });

  it("normalizes broker urls", () => {
    expect(normalizeBrokerUrl("100.107.78.30:7171")).toBe("ws://100.107.78.30:7171");
    expect(normalizeBrokerUrl("http://localhost:7171")).toBe("ws://localhost:7171");
  });

  it("parses join commands and forwards pi args after --", () => {
    const parsed = parseCliArgs(
      ["join", "100.107.78.30:7171", "demo", "--runtime", "linux", "--", "--model", "openai/gpt-5"],
      "/Users/nickkarpov/advaita",
    );

    expect(parsed.kind).toBe("launch");
    if (parsed.kind !== "launch") return;
    expect(parsed.mode).toBe("join");
    expect(parsed.brokerUrl).toBe("ws://100.107.78.30:7171");
    expect(parsed.sessionName).toBe("demo");
    expect(parsed.runtimeId).toBe("linux");
    expect(parsed.piArgs).toEqual(["--model", "openai/gpt-5"]);
  });

  it("generates a friendly session name for plain advaita", () => {
    const parsed = parseCliArgs([], "/Users/nickkarpov/advaita", {
      generateSessionName: () => "ember-otter-a1b",
    });
    expect(parsed.kind).toBe("launch");
    if (parsed.kind !== "launch") return;
    expect(parsed.mode).toBe("local");
    expect(parsed.sessionName).toBe("ember-otter-a1b");
    expect(parsed.sessionNameSource).toBe("generated");
  });

  it("keeps explicit session names on the seamless default path", () => {
    const parsed = parseCliArgs(["demo"], "/Users/nickkarpov/advaita", {
      generateSessionName: () => "ignored",
    });
    expect(parsed.kind).toBe("launch");
    if (parsed.kind !== "launch") return;
    expect(parsed.mode).toBe("local");
    expect(parsed.sessionName).toBe("demo");
    expect(parsed.sessionNameSource).toBe("explicit");
  });

  it("parses host mode defaults", () => {
    const parsed = parseCliArgs(["host", "demo"], "/Users/nickkarpov/advaita");
    expect(parsed.kind).toBe("launch");
    if (parsed.kind !== "launch") return;
    expect(parsed.mode).toBe("host");
    expect(parsed.listenHost).toBe("0.0.0.0");
    expect(parsed.port).toBe(7171);
  });
});
