import { hostname } from "node:os";
import { spawn, type ChildProcess } from "node:child_process";
import type { LaunchCommand } from "./args.js";
import { ensureLocalBroker } from "./local-broker.js";
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

function spawnPi(command: LaunchCommand, brokerUrl: string): ChildProcess {
  const runtime = resolvePiRuntimeArtifacts();
  const piPackage = resolvePiPackageArtifacts();
  const args = [
    runtime.cliPath,
    "-e",
    piPackage.extensionEntrypoint,
    "--advaita-url",
    brokerUrl,
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

  let brokerUrl = command.brokerUrl;
  let stopBroker: (() => Promise<void>) | undefined;

  if (!brokerUrl) {
    const broker = await ensureLocalBroker({
      listenHost: command.listenHost,
      advertiseHost: command.advertiseHost,
      port: command.port,
      dataDir: command.dataDir,
    });
    brokerUrl = broker.url;
    stopBroker = () => broker.stop();

    if (command.mode === "host") {
      console.error(`Advaita host ready: ${broker.shareUrl} (session ${command.sessionName})`);
      console.error(`Join from another machine with: advaita join ${broker.shareUrl} ${command.sessionName}`);
    } else {
      console.error(`${broker.attached ? "Attached to" : "Started"} local Advaita broker at ${broker.url}`);
    }
  } else {
    console.error(`Connecting to Advaita broker ${brokerUrl} (session ${command.sessionName})`);
  }

  const piChild = spawnPi(command, brokerUrl);
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
