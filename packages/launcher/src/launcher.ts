import { hostname } from "node:os";
import { spawn, type ChildProcess } from "node:child_process";
import { createInterface } from "node:readline/promises";
import type { LaunchCommand } from "./args.js";
import { discoverTailscaleSessionHosts, ensureLocalBroker, localSessionExists, type DiscoveredSessionHost } from "./local-broker.js";
import { resolvePiPackageArtifacts, resolvePiRuntimeArtifacts } from "./runtime-resolution.js";
import { runDoctor, hasDoctorErrors } from "./doctor.js";

function sanitizeRuntimeId(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9._-]+/g, "-")
    .replace(/^-+|-+$/g, "") || "runtime";
}

async function assertLaunchReadiness(): Promise<void> {
  const report = await runDoctor();
  if (hasDoctorErrors(report)) {
    const lines = report.checks
      .filter((check) => check.status === "error")
      .map((check) => `${check.name}: ${check.detail}`);
    throw new Error(`Advaita launch preflight failed:\n${lines.join("\n")}`);
  }
}

function spawnPi(command: LaunchCommand, brokerUrl: string, shareUrl: string): ChildProcess {
  const runtime = resolvePiRuntimeArtifacts();
  const piPackage = resolvePiPackageArtifacts();
  const args = [
    runtime.cliPath,
    "-e",
    piPackage.extensionEntrypoint,
    "--advaita-url",
    brokerUrl,
    "--advaita-share-url",
    shareUrl,
    "--advaita-session",
    command.sessionName,
    "--advaita-runtime",
    command.runtimeId ?? sanitizeRuntimeId(hostname()),
  ];

  if (command.displayName) {
    args.push("--advaita-display-name", command.displayName);
  }

  args.push(...command.piArgs);

  return spawn(process.execPath, args, {
    cwd: command.cwd,
    env: process.env,
    stdio: "inherit",
  });
}

function buildMissingSessionPrompt(sessionName: string, discoveryAvailable: boolean): string {
  return discoveryAvailable
    ? `No existing session named "${sessionName}" was found locally or via Tailscale discovery. Host it locally? [Y/n] `
    : `No existing local session named "${sessionName}" was found, and Tailscale discovery is unavailable from this environment. Host it locally? [Y/n] `;
}

async function confirmCreateLocalSession(sessionName: string, discoveryAvailable: boolean): Promise<boolean> {
  const prompt = buildMissingSessionPrompt(sessionName, discoveryAvailable);
  if (!process.stdin.isTTY || !process.stdout.isTTY) {
    console.error(prompt.replace(/ \[Y\/n\] $/, "; creating it locally."));
    return true;
  }

  const rl = createInterface({ input: process.stdin, output: process.stdout });
  try {
    const answer = await rl.question(prompt);
    const normalized = answer.trim().toLowerCase();
    return normalized === "" || normalized === "y" || normalized === "yes";
  } finally {
    rl.close();
  }
}

async function chooseDiscoveredSession(sessionName: string, matches: DiscoveredSessionHost[]): Promise<DiscoveredSessionHost | undefined> {
  if (matches.length === 0) {
    return undefined;
  }
  if (matches.length === 1) {
    return matches[0];
  }
  if (!process.stdin.isTTY || !process.stdout.isTTY) {
    throw new Error(
      `Multiple Tailscale-visible Advaita sessions named "${sessionName}" were found. Re-run with an explicit broker URL:\n${matches
        .map((match) => `- advaita join ${match.brokerUrl} ${sessionName}`)
        .join("\n")}`,
    );
  }

  console.error(`Multiple Tailscale-visible Advaita sessions named "${sessionName}" were found:`);
  for (const [index, match] of matches.entries()) {
    console.error(`  ${index + 1}. ${match.hostName} (${match.address})`);
  }

  const rl = createInterface({ input: process.stdin, output: process.stdout });
  try {
    const answer = await rl.question(`Choose a host [1-${matches.length}] or press Enter to cancel: `);
    const normalized = answer.trim();
    if (!normalized) {
      return undefined;
    }
    const selectedIndex = Number(normalized) - 1;
    if (!Number.isInteger(selectedIndex) || selectedIndex < 0 || selectedIndex >= matches.length) {
      throw new Error(`Invalid selection: ${answer}`);
    }
    return matches[selectedIndex];
  } finally {
    rl.close();
  }
}

async function prepareLocalLaunch(
  command: LaunchCommand,
): Promise<{ cancel: boolean; brokerUrl?: string; hostDiscoverably?: boolean }> {
  if (command.mode !== "local" || command.brokerUrl) {
    return { cancel: false };
  }

  const existsLocally = localSessionExists(command.dataDir, command.sessionName);
  if (existsLocally) {
    console.error(`Joining local Advaita session ${command.sessionName}`);
    return { cancel: false };
  }

  if (command.sessionNameSource === "explicit") {
    const discovery = await discoverTailscaleSessionHosts(command.sessionName, command.port);
    const selected = await chooseDiscoveredSession(command.sessionName, discovery.matches);
    if (selected) {
      console.error(`Discovered Advaita session ${command.sessionName} on ${selected.hostName} (${selected.address})`);
      return { cancel: false, brokerUrl: selected.brokerUrl };
    }

    if (!(await confirmCreateLocalSession(command.sessionName, discovery.available))) {
      console.error("Cancelled.");
      return { cancel: true };
    }
    console.error(`Hosting new local Advaita session ${command.sessionName}`);
    return { cancel: false, hostDiscoverably: true };
  }

  console.error(`Hosting new local Advaita session ${command.sessionName}`);
  return { cancel: false, hostDiscoverably: true };
}

function attachSignalForwarders(piChild: ChildProcess, stopBroker: (() => Promise<void>) | undefined): () => void {
  const forward = async (signal: NodeJS.Signals) => {
    if (piChild.exitCode === null) {
      piChild.kill(signal);
    }
    if (stopBroker) {
      await stopBroker();
    }
  };

  const onSigint = () => {
    void forward("SIGINT");
  };
  const onSigterm = () => {
    void forward("SIGTERM");
  };

  process.on("SIGINT", onSigint);
  process.on("SIGTERM", onSigterm);
  return () => {
    process.off("SIGINT", onSigint);
    process.off("SIGTERM", onSigterm);
  };
}

export async function launchAdvaita(command: LaunchCommand): Promise<number> {
  await assertLaunchReadiness();

  const prepared = await prepareLocalLaunch(command);
  if (prepared.cancel) {
    return 0;
  }

  let brokerUrl = command.brokerUrl ?? prepared.brokerUrl;
  let shareUrl = brokerUrl;
  let stopBroker: (() => Promise<void>) | undefined;

  if (!brokerUrl) {
    const listenHost = prepared.hostDiscoverably && command.listenHost === "127.0.0.1"
      ? "0.0.0.0"
      : command.listenHost;
    const broker = await ensureLocalBroker({
      listenHost,
      advertiseHost: command.advertiseHost,
      port: command.port,
      dataDir: command.dataDir,
    });
    brokerUrl = broker.url;
    shareUrl = broker.shareUrl;
    stopBroker = () => broker.stop();

    if (command.mode === "host") {
      console.error(`Advaita host ready: ${broker.shareUrl} (session ${command.sessionName})`);
      console.error(`Join from another machine with: advaita join ${broker.shareUrl} ${command.sessionName}`);
    } else {
      console.error(`${broker.attached ? "Attached to" : "Started"} local Advaita broker at ${broker.url}`);
      console.error(`Advaita session: ${command.sessionName}`);
    }
  } else {
    shareUrl ??= brokerUrl;
    console.error(`Connecting to Advaita broker ${brokerUrl} (session ${command.sessionName})`);
  }

  const piChild = spawnPi(command, brokerUrl, shareUrl ?? brokerUrl);
  const detachSignals = attachSignalForwarders(piChild, stopBroker);

  const exitCode = await new Promise<number>((resolve, reject) => {
    piChild.once("error", reject);
    piChild.once("exit", (code, signal) => {
      if (signal) {
        resolve(1);
      } else {
        resolve(code ?? 0);
      }
    });
  });

  detachSignals();
  if (stopBroker) {
    await stopBroker();
  }
  return exitCode;
}
