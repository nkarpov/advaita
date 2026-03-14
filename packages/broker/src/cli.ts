#!/usr/bin/env node
import { resolve } from "node:path";
import { AdvaitaBrokerWsServer } from "./ws-server.js";

interface ParsedArgs {
  host: string;
  port: number;
  dataDir: string;
}

function parseArgs(argv: string[]): ParsedArgs {
  let host = "127.0.0.1";
  let port = 7171;
  let dataDir = ".advaita-broker";

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    const next = argv[i + 1];
    switch (arg) {
      case "--host":
        if (next) {
          host = next;
          i++;
        }
        break;
      case "--port":
        if (next) {
          const parsed = Number(next);
          if (!Number.isNaN(parsed)) {
            port = parsed;
          }
          i++;
        }
        break;
      case "--data-dir":
        if (next) {
          dataDir = next;
          i++;
        }
        break;
      case "--help":
      case "-h":
        console.log("Usage: advaita-broker [--host <host>] [--port <port>] [--data-dir <dir>]");
        process.exit(0);
      default:
        break;
    }
  }

  return { host, port, dataDir: resolve(dataDir) };
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));
  const server = new AdvaitaBrokerWsServer({
    host: args.host,
    port: args.port,
    dataDir: args.dataDir,
  });
  await server.listen();
  console.log(`Advaita broker listening on ${server.address}`);
  console.log(`Session data: ${args.dataDir}`);

  const shutdown = async () => {
    await server.close();
    process.exit(0);
  };

  process.on("SIGINT", () => {
    void shutdown();
  });
  process.on("SIGTERM", () => {
    void shutdown();
  });
}

void main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
