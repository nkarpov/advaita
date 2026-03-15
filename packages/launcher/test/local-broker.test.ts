import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { localSessionExists, parseTailscaleStatusJson, pickAdvertiseHostFromInterfaces } from "../src/local-broker.js";

describe("local broker helpers", () => {
  it("prefers tailscale-style addresses", () => {
    expect(
      pickAdvertiseHostFromInterfaces({
        en0: [{ address: "192.168.1.20", netmask: "255.255.255.0", family: "IPv4", mac: "", internal: false, cidr: null }],
        tailscale0: [{ address: "100.74.167.68", netmask: "255.255.255.0", family: "IPv4", mac: "", internal: false, cidr: null }],
      }),
    ).toBe("100.74.167.68");
  });

  it("parses online tailscale peers for discovery", () => {
    expect(
      parseTailscaleStatusJson(
        JSON.stringify({
          Peer: {
            a: {
              HostName: "evo-x1",
              TailscaleIPs: ["100.74.167.68"],
              Online: true,
            },
            b: {
              HostName: "offline-host",
              TailscaleIPs: ["100.88.12.3"],
              Online: false,
            },
          },
        }),
      ),
    ).toEqual([{ hostName: "evo-x1", address: "100.74.167.68" }]);
  });

  it("detects locally persisted sessions from the broker data dir", () => {
    const dataDir = mkdtempSync(join(tmpdir(), "advaita-local-broker-"));
    writeFileSync(
      join(dataDir, "index.json"),
      `${JSON.stringify({ demo: { sessionPath: "/tmp/demo", metadataPath: "/tmp/demo-meta" } }, null, 2)}\n`,
      "utf8",
    );

    expect(localSessionExists(dataDir, "demo")).toBe(true);
    expect(localSessionExists(dataDir, "missing")).toBe(false);
  });
});
