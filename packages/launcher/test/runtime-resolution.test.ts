import { describe, expect, it } from "vitest";
import { missingPiSyncApis } from "../src/runtime-resolution.js";

describe("missingPiSyncApis", () => {
  it("reports missing required APIs", () => {
    expect(missingPiSyncApis("continueSession")).toEqual(["replaceSessionContents", "importSessionEntries"]);
  });

  it("passes when all required APIs exist", () => {
    expect(missingPiSyncApis("replaceSessionContents importSessionEntries continueSession")).toEqual([]);
  });
});
