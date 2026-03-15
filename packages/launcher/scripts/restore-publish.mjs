import { existsSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const scriptDir = dirname(fileURLToPath(import.meta.url));
const launcherDir = resolve(scriptDir, "..");
const workDir = join(launcherDir, ".pack");
const backupManifestPath = join(workDir, "launcher.package.json.backup");
const launcherManifestPath = join(launcherDir, "package.json");

if (existsSync(backupManifestPath)) {
  writeFileSync(launcherManifestPath, readFileSync(backupManifestPath, "utf8"));
}

rmSync(join(launcherDir, "node_modules"), { recursive: true, force: true });
rmSync(join(launcherDir, "vendor"), { recursive: true, force: true });
rmSync(workDir, { recursive: true, force: true });
