import { hostname, networkInterfaces } from "node:os";
import { spawn, type ChildProcess } from "node:child_process";
import { mkdir } from "node:fs/promises";
import { setTimeout as delay } from "node:timers/promises";
import WebSocket from "ws";
import type { BrokerMessage, ClientMessage } from "@advaita/shared";
import { parseBrokerMessage, serializeProtocolMessage } from "@advaita/shared";
import { resolveBrokerArtifacts } from "./runtime-resolution.js";

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

async function probeBroker(url: string, timeoutMs = 1500): Promise<boolean> {
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
