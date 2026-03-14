import { describe, expect, it } from "vitest";
import { extractRequestedModelQuery } from "../src/model-routing.js";

describe("extractRequestedModelQuery", () => {
  it("extracts natural-language model requests", () => {
    expect(extractRequestedModelQuery("run this on linux using gpt 5")).toBe("gpt 5");
    expect(extractRequestedModelQuery("run this on linux with claude sonnet 4.5")).toBe("claude sonnet 4.5");
    expect(extractRequestedModelQuery("run this task in linux w gpt 4")).toBe("gpt 4");
  });

  it("supports explicit slash-style model requests", () => {
    expect(extractRequestedModelQuery("/model openai/gpt-5")).toBe("openai/gpt-5");
  });

  it("stops before follow-up instructions", () => {
    expect(extractRequestedModelQuery("run this on linux using gpt 5 then summarize the logs"))
      .toBe("gpt 5");
  });
});
