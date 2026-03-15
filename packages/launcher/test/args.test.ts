import { describe, expect, it } from "vitest";
import { defaultSessionName, normalizeBrokerUrl, parseCliArgs } from "../src/args.js";

describe("launcher args", () => {
  it("uses the cwd basename as the default session name", () => {
    expect(defaultSessionName("/Users/nickkarpov/advaita")).toBe("advaita");
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

  it("parses host mode defaults", () => {
    const parsed = parseCliArgs(["host", "demo"], "/Users/nickkarpov/advaita");
    expect(parsed.kind).toBe("launch");
    if (parsed.kind !== "launch") return;
    expect(parsed.mode).toBe("host");
    expect(parsed.listenHost).toBe("0.0.0.0");
    expect(parsed.port).toBe(7171);
  });
});
