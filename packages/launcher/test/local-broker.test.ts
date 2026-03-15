import { describe, expect, it } from "vitest";
import { pickAdvertiseHostFromInterfaces } from "../src/local-broker.js";

describe("pickAdvertiseHostFromInterfaces", () => {
  it("prefers tailscale-style addresses", () => {
    expect(
      pickAdvertiseHostFromInterfaces({
        en0: [{ address: "192.168.1.20", netmask: "255.255.255.0", family: "IPv4", mac: "", internal: false, cidr: null }],
        tailscale0: [{ address: "100.74.167.68", netmask: "255.255.255.0", family: "IPv4", mac: "", internal: false, cidr: null }],
      }),
    ).toBe("100.74.167.68");
  });
});
