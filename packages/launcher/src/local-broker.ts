import { hostname, networkInterfaces } from "node:os";
import { execFile, spawn, type ChildProcess } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { mkdir } from "node:fs/promises";
import { join } from "node:path";
import { setTimeout as delay } from "node:timers/promises";
import { promisify } from "node:util";
import WebSocket from "ws";
import type { BrokerMessage, ClientMessage } from "@advaita/shared";
import { importResolvedPackageModule, resolveBrokerArtifacts } from "./runtime-resolution.js";

export interface EnsureLocalBrokerOptions {
  listenHost: string;
  advertiseHost?: string;
  port: number;
  dataDir: string;
}

export interface LocalBrokerHandle {
  url: string;
  shareUrl: string;
  attached: boolean;
  stop(): Promise<void>;
}

export interface TailscalePeerCandidate {
  hostName: string;
  address: string;
}

export interface DiscoveredSessionHost {
  hostName: string;
  address: string;
  brokerUrl: string;
}

export interface TailscalePeerDiscoveryResult {
  available: boolean;
  peers: TailscalePeerCandidate[];
  sourceCommand?: string;
}

export interface DiscoveredSessionHostsResult {
  available: boolean;
  matches: DiscoveredSessionHost[];
  sourceCommand?: string;
}

type SharedProtocolModule = typeof import("@advaita/shared");
const execFileAsync = promisify(execFile);
let sharedProtocolModulePromise: Promise<SharedProtocolModule> | undefined;

function loadSharedProtocolModule(): Promise<SharedProtocolModule> {
  sharedProtocolModulePromise ??= importResolvedPackageModule<SharedProtocolModule>("@advaita/shared");
  return sharedProtocolModulePromise;
}

function brokerConnectHost(listenHost: string): string {
  return listenHost === "0.0.0.0" || listenHost === "::" ? "127.0.0.1" : listenHost;
}

export function pickAdvertiseHostFromInterfaces(interfaces: ReturnType<typeof networkInterfaces>): string | undefined {
  const candidates: string[] = [];
  const tailscaleCandidates: string[] = [];
  for (const [name, records] of Object.entries(interfaces)) {
    for (const record of records ?? []) {
      if (record.internal || record.family !== "IPv4") continue;
      if (name.toLowerCase().includes("tailscale") || record.address.startsWith("100.")) {
        tailscaleCandidates.push(record.address);
      } else {
        candidates.push(record.address);
      }
    }
  }
  return tailscaleCandidates[0] ?? candidates[0];
}

function guessAdvertiseHost(): string {
  return pickAdvertiseHostFromInterfaces(networkInterfaces()) ?? hostname();
}

export function getTailscaleStatusCommandCandidates(): Array<{ command: string; args: string[] }> {
  return [
    { command: "tailscale", args: ["status", "--json"] },
    { command: "tailscale.exe", args: ["status", "--json"] },
    { command: "/mnt/c/Program Files/Tailscale/tailscale.exe", args: ["status", "--json"] },
    {
      command: "powershell.exe",
      args: ["-NoProfile", "-Command", "tailscale status --json"],
    },
    {
      command: "/mnt/c/Windows/System32/WindowsPowerShell/v1.0/powershell.exe",
      args: ["-NoProfile", "-Command", "tailscale status --json"],
    },
  ];
}

export function localSessionExists(dataDir: string, sessionName: string): boolean {
  const indexPath = join(dataDir, "index.json");
  if (!existsSync(indexPath)) {
    return false;
  }

  try {
    const index = JSON.parse(readFileSync(indexPath, "utf8")) as Record<string, unknown>;
    return Object.prototype.hasOwnProperty.call(index, sessionName);
  } catch {
    return false;
  }
}

export function parseTailscaleStatusJson(raw: string): TailscalePeerCandidate[] {
  try {
    const parsed = JSON.parse(raw) as {
      Peer?: Record<string, { HostName?: string; DNSName?: string; TailscaleIPs?: string[]; Online?: boolean }>;
    };

    const peers: TailscalePeerCandidate[] = [];
    for (const peer of Object.values(parsed.Peer ?? {})) {
      if (peer?.Online === false) {
        continue;
      }
      const hostName = peer?.HostName?.trim() || peer?.DNSName?.split(".")[0]?.trim() || "peer";
      for (const ip of peer?.TailscaleIPs ?? []) {
        if (typeof ip !== "string" || ip.includes(":")) {
          continue;
        }
        peers.push({ hostName, address: ip });
      }
    }

    const seen = new Set<string>();
    return peers.filter((peer) => {
      if (seen.has(peer.address)) {
        return false;
      }
      seen.add(peer.address);
      return true;
    });
  } catch {
    return [];
  }
}

export async function getTailscalePeerCandidates(): Promise<TailscalePeerDiscoveryResult> {
  for (const candidate of getTailscaleStatusCommandCandidates()) {
    try {
      const { stdout } = await execFileAsync(candidate.command, candidate.args, {
        timeout: 1500,
        maxBuffer: 1024 * 1024,
        windowsHide: true,
      });
      return {
        available: true,
        peers: parseTailscaleStatusJson(stdout),
        sourceCommand: candidate.command,
      };
    } catch {
      // try next candidate
    }
  }

  return {
    available: false,
    peers: [],
  };
}

export async function remoteSessionExists(host: string, port: number, sessionName: string, timeoutMs = 1200): Promise<boolean> {
  try {
    const response = await fetch(`http://${host}:${port}/sessions/${encodeURIComponent(sessionName)}`, {
      signal: AbortSignal.timeout(timeoutMs),
    });
    if (!response.ok) {
      return false;
    }
    const payload = await response.json() as { exists?: boolean };
    return payload.exists === true;
  } catch {
    return false;
  }
}

export async function discoverTailscaleSessionHosts(
  sessionName: string,
  port: number,
): Promise<DiscoveredSessionHostsResult> {
  const discovery = await getTailscalePeerCandidates();
  if (!discovery.available) {
    return {
      available: false,
      matches: [],
    };
  }

  const matches = await Promise.all(
    discovery.peers.map(async (peer) => {
      if (!(await remoteSessionExists(peer.address, port, sessionName))) {
        return undefined;
      }
      return {
        hostName: peer.hostName,
        address: peer.address,
        brokerUrl: `ws://${peer.address}:${port}`,
      } satisfies DiscoveredSessionHost;
    }),
  );
  return {
    available: true,
    matches: matches.filter((match): match is DiscoveredSessionHost => Boolean(match)),
    sourceCommand: discovery.sourceCommand,
  };
}

async function probeBroker(url: string, timeoutMs = 1500): Promise<boolean> {
  const { parseBrokerMessage, serializeProtocolMessage } = await loadSharedProtocolModule();
  return await new Promise<boolean>((resolve) => {
    const socket = new WebSocket(url);
    const timeout = setTimeout(() => {
      socket.terminate();
      resolve(false);
    }, timeoutMs);

    const finish = (value: boolean) => {
      clearTimeout(timeout);
      try {
        socket.close();
      } catch {
        // noop
      }
      resolve(value);
    };

    socket.on("open", () => {
      const hello: ClientMessage = {
        type: "client.hello",
        sessionName: "advaita-probe",
        clientId: `probe-${Date.now()}`,
        runtimeId: "probe",
        displayName: "probe",
        cwd: process.cwd(),
        modelState: {
          currentModel: null,
          availableModels: [],
          thinkingLevel: "off",
        },
      };
      socket.send(serializeProtocolMessage(hello));
    });

    socket.on("message", (raw) => {
      try {
        const message = parseBrokerMessage(raw.toString("utf8")) as BrokerMessage;
        finish(message.type === "broker.snapshot" || message.type === "broker.notice");
      } catch {
        finish(false);
      }
    });

    socket.on("error", () => finish(false));
    socket.on("close", () => finish(false));
  });
}

async function waitForBrokerReady(child: ChildProcess, listenHost: string, port: number): Promise<void> {
  const connectHost = brokerConnectHost(listenHost);
  const url = `ws://${connectHost}:${port}`;
  const startedAt = Date.now();
  while (Date.now() - startedAt < 5000) {
    if (child.exitCode !== null) {
      throw new Error(`Local broker exited early with code ${child.exitCode}`);
    }
    if (await probeBroker(url, 250)) {
      return;
    }
    await delay(150);
  }
  throw new Error(`Timed out waiting for local broker at ${url}`);
}

export async function ensureLocalBroker(options: EnsureLocalBrokerOptions): Promise<LocalBrokerHandle> {
  await mkdir(options.dataDir, { recursive: true });

  const connectHost = brokerConnectHost(options.listenHost);
  const url = `ws://${connectHost}:${options.port}`;
  const advertiseHost = options.advertiseHost ?? (options.listenHost === "0.0.0.0" ? guessAdvertiseHost() : options.listenHost);
  const shareUrl = `ws://${advertiseHost}:${options.port}`;

  if (await probeBroker(url)) {
    return {
      url,
      shareUrl,
      attached: true,
      async stop() {
        // attached to an existing broker; do not stop it
      },
    };
  }

  const broker = resolveBrokerArtifacts();
  const stderrChunks: string[] = [];
  const stdoutChunks: string[] = [];
  const child = spawn(process.execPath, [broker.cliPath, "--host", options.listenHost, "--port", String(options.port), "--data-dir", options.dataDir], {
    cwd: process.cwd(),
    env: process.env,
    stdio: ["ignore", "pipe", "pipe"],
  });

  child.stdout?.on("data", (chunk: Buffer | string) => {
    stdoutChunks.push(chunk.toString());
  });
  child.stderr?.on("data", (chunk: Buffer | string) => {
    stderrChunks.push(chunk.toString());
  });

  try {
    await waitForBrokerReady(child, options.listenHost, options.port);
  } catch (error) {
    child.kill("SIGTERM");
    const suffix = [...stdoutChunks, ...stderrChunks].join("").trim();
    const baseMessage = error instanceof Error ? error.message : String(error);
    throw new Error(suffix ? `${baseMessage}\n${suffix}` : baseMessage);
  }

  return {
    url,
    shareUrl,
    attached: false,
    async stop() {
      if (child.exitCode !== null) return;
      child.kill("SIGTERM");
      await new Promise<void>((resolve) => {
        child.once("exit", () => resolve());
        setTimeout(() => {
          if (child.exitCode === null) {
            child.kill("SIGKILL");
          }
          resolve();
        }, 1500);
      });
    },
  };
}

export { guessAdvertiseHost, probeBroker };
