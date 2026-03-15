import { access, mkdir, readFile } from "node:fs/promises";
import { constants } from "node:fs";
import { join } from "node:path";
import { homedir } from "node:os";
import { spawnSync } from "node:child_process";
import { describeTurnIntentRouterEnvironment, resolveTurnIntentRouterEnvironment } from "@advaita/broker";
import { resolveBrokerArtifacts, resolvePiPackageArtifacts, resolvePiRuntimeArtifacts, resolveSharedArtifacts, resolveCurrentPackage, missingPiSyncApis } from "./runtime-resolution.js";

export type DoctorStatus = "ok" | "warn" | "error";

export interface DoctorCheck {
  name: string;
  status: DoctorStatus;
  detail: string;
}

export interface DoctorReport {
  checks: DoctorCheck[];
  launcherVersion: string;
}

function compareNodeVersion(current: string, minimum: string): boolean {
  const currentParts = current.replace(/^v/, "").split(".").map(Number);
  const minimumParts = minimum.split(".").map(Number);
  for (let i = 0; i < Math.max(currentParts.length, minimumParts.length); i++) {
    const a = currentParts[i] ?? 0;
    const b = minimumParts[i] ?? 0;
    if (a > b) return true;
    if (a < b) return false;
  }
  return true;
}

async function checkWritableDirectory(path: string): Promise<DoctorCheck> {
  await mkdir(path, { recursive: true });
  await access(path, constants.W_OK);
  return {
    name: "advaita-data-dir",
    status: "ok",
    detail: `Writable: ${path}`,
  };
}

function detectGlobalPiVersion(): DoctorCheck | undefined {
  const result = spawnSync("pi", ["--version"], { encoding: "utf8" });
  if (result.error) {
    return {
      name: "global-pi",
      status: "warn",
      detail: "No global `pi` binary found. That is fine because Advaita launches its own bundled runtime.",
    };
  }
  const version = (result.stdout || result.stderr).trim() || "unknown";
  return {
    name: "global-pi",
    status: "warn",
    detail: `Global pi detected at version ${version}. Advaita does not rely on it.`,
  };
}

export async function runDoctor(): Promise<DoctorReport> {
  const checks: DoctorCheck[] = [];
  const launcherPackage = resolveCurrentPackage(import.meta.url);
  const launcherVersion = launcherPackage.packageJson.version ?? "0.0.0";

  checks.push({
    name: "node-version",
    status: compareNodeVersion(process.version, "20.6.0") ? "ok" : "error",
    detail: `Node ${process.version}`,
  });

  const shared = resolveSharedArtifacts().packageInfo;
  checks.push({
    name: "shared-package",
    status: "ok",
    detail: `Resolved ${shared.packageJson.name}@${shared.packageJson.version} from ${shared.packageRoot}`,
  });

  const broker = resolveBrokerArtifacts();
  checks.push({
    name: "broker-runtime",
    status: "ok",
    detail: `Resolved ${broker.packageInfo.packageJson.name}@${broker.packageInfo.packageJson.version} with CLI ${broker.cliPath}`,
  });

  const router = resolveTurnIntentRouterEnvironment();
  checks.push({
    name: "turn-router",
    status: router.mode === "heuristic" || router.apiKey ? "ok" : "warn",
    detail: describeTurnIntentRouterEnvironment(),
  });

  const piPackage = resolvePiPackageArtifacts();
  checks.push({
    name: "pi-package",
    status: "ok",
    detail: `Resolved ${piPackage.packageInfo.packageJson.name}@${piPackage.packageInfo.packageJson.version} with entry ${piPackage.extensionEntrypoint}`,
  });

  const piRuntime = resolvePiRuntimeArtifacts();
  const typesContent = await readFile(piRuntime.typesPath, "utf8");
  const missingApis = missingPiSyncApis(typesContent);
  checks.push({
    name: "pi-runtime",
    status: missingApis.length === 0 ? "ok" : "error",
    detail:
      missingApis.length === 0
        ? `Resolved forked Pi runtime ${piRuntime.packageInfo.packageJson.version} with CLI ${piRuntime.cliPath}`
        : `Pi runtime is missing required Advaita APIs: ${missingApis.join(", ")}`,
  });

  checks.push(await checkWritableDirectory(join(homedir(), ".advaita")));

  const globalPi = detectGlobalPiVersion();
  if (globalPi) {
    checks.push(globalPi);
  }

  return { checks, launcherVersion };
}

export function hasDoctorErrors(report: DoctorReport): boolean {
  return report.checks.some((check) => check.status === "error");
}

export function formatDoctorReport(report: DoctorReport): string {
  const lines = [`Advaita doctor`, `launcher=${report.launcherVersion}`, ""];
  for (const check of report.checks) {
    const prefix = check.status === "ok" ? "OK" : check.status === "warn" ? "WARN" : "ERROR";
    lines.push(`${prefix.padEnd(5)} ${check.name} - ${check.detail}`);
  }
  const errorCount = report.checks.filter((check) => check.status === "error").length;
  const warnCount = report.checks.filter((check) => check.status === "warn").length;
  lines.push("");
  lines.push(`Summary: ${errorCount} error(s), ${warnCount} warning(s)`);
  return lines.join("\n");
}
