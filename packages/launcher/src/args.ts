import { basename, resolve } from "node:path";
import { homedir } from "node:os";

export class CliUsageError extends Error {}

export type LaunchMode = "local" | "host" | "join";

export interface LaunchCommand {
  kind: "launch";
  mode: LaunchMode;
  sessionName: string;
  brokerUrl?: string;
  listenHost: string;
  advertiseHost?: string;
  port: number;
  dataDir: string;
  runtimeId?: string;
  displayName?: string;
  cwd: string;
  piArgs: string[];
}

export interface DoctorCommand {
  kind: "doctor";
  json: boolean;
}

export interface VersionCommand {
  kind: "version";
  json: boolean;
}

export interface HelpCommand {
  kind: "help";
}

export type ParsedCommand = LaunchCommand | DoctorCommand | VersionCommand | HelpCommand;

const DEFAULT_PORT = 7171;
const DEFAULT_LOCAL_HOST = "127.0.0.1";
const DEFAULT_PUBLIC_HOST = "0.0.0.0";

function sanitizeSessionName(value: string): string {
  const sanitized = value
    .toLowerCase()
    .replace(/[^a-z0-9._-]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return sanitized || "default";
}

export function defaultSessionName(cwd: string): string {
  return sanitizeSessionName(basename(cwd));
}

function defaultDataDir(): string {
  return resolve(homedir(), ".advaita", "broker");
}

function normalizeBrokerUrl(raw: string): string {
  if (/^wss?:\/\//i.test(raw)) {
    return raw;
  }
  if (/^https?:\/\//i.test(raw)) {
    return raw.replace(/^http/i, "ws");
  }
  return `ws://${raw}`;
}

function parseNumber(value: string, flagName: string): number {
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < 0) {
    throw new CliUsageError(`${flagName} must be a non-negative integer`);
  }
  return parsed;
}

function splitPassThrough(argv: string[]): { launcherArgs: string[]; piArgs: string[] } {
  const separatorIndex = argv.indexOf("--");
  if (separatorIndex === -1) {
    return { launcherArgs: argv, piArgs: [] };
  }
  return {
    launcherArgs: argv.slice(0, separatorIndex),
    piArgs: argv.slice(separatorIndex + 1),
  };
}

export function parseCliArgs(argv: string[], cwd = process.cwd()): ParsedCommand {
  const { launcherArgs, piArgs } = splitPassThrough(argv);
  if (launcherArgs.includes("--help") || launcherArgs.includes("-h")) {
    return { kind: "help" };
  }
  if (launcherArgs.includes("--version") && launcherArgs.length === 1) {
    return { kind: "version", json: false };
  }

  const first = launcherArgs[0];
  let mode: LaunchMode = "local";
  let positionals = launcherArgs;
  if (first === "host") {
    mode = "host";
    positionals = launcherArgs.slice(1);
  } else if (first === "join") {
    mode = "join";
    positionals = launcherArgs.slice(1);
  } else if (first === "doctor") {
    return { kind: "doctor", json: launcherArgs.includes("--json") };
  } else if (first === "version") {
    return { kind: "version", json: launcherArgs.includes("--json") };
  } else if (first === "help") {
    return { kind: "help" };
  }

  let sessionName: string | undefined;
  let brokerUrl: string | undefined;
  let listenHost = mode === "host" ? DEFAULT_PUBLIC_HOST : DEFAULT_LOCAL_HOST;
  let advertiseHost: string | undefined;
  let port = DEFAULT_PORT;
  let dataDir = defaultDataDir();
  let runtimeId: string | undefined;
  let displayName: string | undefined;
  let effectiveCwd = cwd;

  const positionalValues: string[] = [];
  for (let index = 0; index < positionals.length; index++) {
    const arg = positionals[index];
    const next = positionals[index + 1];
    switch (arg) {
      case "--session":
        if (!next) throw new CliUsageError("--session requires a value");
        sessionName = sanitizeSessionName(next);
        index++;
        break;
      case "--broker-url":
        if (!next) throw new CliUsageError("--broker-url requires a value");
        brokerUrl = normalizeBrokerUrl(next);
        index++;
        break;
      case "--listen-host":
        if (!next) throw new CliUsageError("--listen-host requires a value");
        listenHost = next;
        index++;
        break;
      case "--advertise-host":
        if (!next) throw new CliUsageError("--advertise-host requires a value");
        advertiseHost = next;
        index++;
        break;
      case "--port":
        if (!next) throw new CliUsageError("--port requires a value");
        port = parseNumber(next, "--port");
        index++;
        break;
      case "--data-dir":
        if (!next) throw new CliUsageError("--data-dir requires a value");
        dataDir = resolve(next);
        index++;
        break;
      case "--runtime":
        if (!next) throw new CliUsageError("--runtime requires a value");
        runtimeId = next;
        index++;
        break;
      case "--display-name":
        if (!next) throw new CliUsageError("--display-name requires a value");
        displayName = next;
        index++;
        break;
      case "--cwd":
        if (!next) throw new CliUsageError("--cwd requires a value");
        effectiveCwd = resolve(next);
        index++;
        break;
      case "--json":
        throw new CliUsageError("--json is only supported with doctor or version");
      default:
        if (arg.startsWith("-")) {
          throw new CliUsageError(`Unknown option: ${arg}`);
        }
        positionalValues.push(arg);
        break;
    }
  }

  if (mode === "join") {
    if (positionalValues.length === 0 && !brokerUrl) {
      throw new CliUsageError("join requires a broker URL");
    }
    if (positionalValues.length > 0) {
      if (brokerUrl) {
        throw new CliUsageError("Specify broker URL either positionally or with --broker-url, not both");
      }
      brokerUrl = normalizeBrokerUrl(positionalValues[0]);
      sessionName ??= positionalValues[1] ? sanitizeSessionName(positionalValues[1]) : undefined;
      if (positionalValues.length > 2) {
        throw new CliUsageError("Too many positional arguments for join");
      }
    }
  } else if (positionalValues.length > 1) {
    throw new CliUsageError("Too many positional arguments");
  } else if (positionalValues.length === 1) {
    sessionName = sanitizeSessionName(positionalValues[0]);
  }

  return {
    kind: "launch",
    mode,
    sessionName: sessionName ?? defaultSessionName(effectiveCwd),
    brokerUrl,
    listenHost,
    advertiseHost,
    port,
    dataDir,
    runtimeId,
    displayName,
    cwd: effectiveCwd,
    piArgs,
  };
}

export function renderHelpText(): string {
  return [
    "Advaita",
    "",
    "Usage:",
    "  advaita [session] [options] [-- <pi args>]",
    "  advaita host [session] [options] [-- <pi args>]",
    "  advaita join <broker-url> [session] [options] [-- <pi args>]",
    "  advaita doctor [--json]",
    "  advaita version [--json]",
    "",
    "Options:",
    "  --session <name>         Shared session name",
    "  --runtime <id>           Runtime id reported to Advaita",
    "  --display-name <name>    Human-friendly runtime display name",
    "  --broker-url <url>       Use an explicit broker URL instead of auto-starting locally",
    "  --listen-host <host>     Host for auto-started local broker (default: 127.0.0.1 or 0.0.0.0 for host)",
    "  --advertise-host <host>  Host/IP shown to remote peers for host mode",
    "  --port <port>            Broker port for host/local mode (default: 7171)",
    "  --data-dir <path>        Local broker data directory (default: ~/.advaita/broker)",
    "  --cwd <path>             Working directory for the launched Pi session",
    "  -h, --help               Show this help",
    "",
    "Examples:",
    "  advaita",
    "  advaita demo",
    "  advaita host demo --advertise-host 100.107.78.30",
    "  advaita join 100.107.78.30:7171 demo",
    "  advaita doctor",
    "  advaita demo -- --model openai/gpt-5",
  ].join("\n");
}

export { normalizeBrokerUrl };
