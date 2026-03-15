import {
  cpSync,
  existsSync,
  mkdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const scriptDir = dirname(fileURLToPath(import.meta.url));
const launcherDir = resolve(scriptDir, "..");
const repoRoot = resolve(launcherDir, "../..");
const piMonoRoot = resolve(repoRoot, "../pi-mono");
const workDir = join(launcherDir, ".pack");
const stageRoot = join(workDir, "stage");
const backupManifestPath = join(workDir, "launcher.package.json.backup");
const launcherManifestPath = join(launcherDir, "package.json");
const vendoredNodeModulesRoot = join(launcherDir, "vendor", "node_modules");

function readJson(path) {
  return JSON.parse(readFileSync(path, "utf8"));
}

function writeJson(path, value) {
  writeFileSync(path, `${JSON.stringify(value, null, 2)}\n`);
}

function resetDir(path) {
  rmSync(path, { recursive: true, force: true });
  mkdirSync(path, { recursive: true });
}

function copyPath(sourceRoot, targetRoot, relativePath) {
  const sourcePath = join(sourceRoot, relativePath);
  if (!existsSync(sourcePath)) {
    throw new Error(`Missing required publish asset: ${sourcePath}`);
  }
  const targetPath = join(targetRoot, relativePath);
  mkdirSync(dirname(targetPath), { recursive: true });
  cpSync(sourcePath, targetPath, { recursive: true });
}

function createInternalPackageManifest(manifest) {
  const next = structuredClone(manifest);
  delete next.scripts;
  delete next.devDependencies;
  delete next.overrides;
  return next;
}

function createSharedManifest(manifest, versions) {
  const next = createInternalPackageManifest(manifest);
  next.dependencies = {
    "@mariozechner/pi-coding-agent": versions.piCodingAgent,
    zod: manifest.dependencies.zod,
  };
  return next;
}

function createBrokerManifest(manifest, versions) {
  const next = createInternalPackageManifest(manifest);
  next.dependencies = {
    "@advaita/shared": versions.shared,
    "@mariozechner/pi-ai": versions.piAi,
    "@mariozechner/pi-coding-agent": versions.piCodingAgent,
    ws: manifest.dependencies.ws,
  };
  return next;
}

function createPiPackageManifest(manifest, versions) {
  const next = createInternalPackageManifest(manifest);
  next.dependencies = {
    "@advaita/shared": versions.shared,
    "@mariozechner/pi-coding-agent": versions.piCodingAgent,
    ws: manifest.dependencies.ws,
  };
  return next;
}

function stagePackage({ sourceDir, includePaths, transformManifest }) {
  const stageDir = join(stageRoot, Math.random().toString(36).slice(2));
  resetDir(stageDir);
  for (const relativePath of includePaths) {
    copyPath(sourceDir, stageDir, relativePath);
  }

  const manifest = readJson(join(sourceDir, "package.json"));
  const transformedManifest = transformManifest(structuredClone(manifest));
  writeJson(join(stageDir, "package.json"), transformedManifest);
  return stageDir;
}

function vendorPackage(specifier, stageDir) {
  const targetRoot = join(vendoredNodeModulesRoot, ...specifier.split("/"));
  rmSync(targetRoot, { recursive: true, force: true });
  mkdirSync(dirname(targetRoot), { recursive: true });
  cpSync(stageDir, targetRoot, { recursive: true });
}

function createPublishManifest(manifest, piCodingAgentManifest) {
  const next = structuredClone(manifest);
  delete next.bundledDependencies;
  next.dependencies = Object.fromEntries(
    Object.entries(manifest.dependencies).filter(([name]) => ![
      "@advaita/broker",
      "@advaita/pi-package",
      "@advaita/shared",
      "@mariozechner/pi-coding-agent",
    ].includes(name)),
  );
  next.optionalDependencies = {
    ...(manifest.optionalDependencies ?? {}),
    ...(piCodingAgentManifest.optionalDependencies ?? {}),
  };
  return next;
}

function cleanup() {
  rmSync(join(launcherDir, "vendor"), { recursive: true, force: true });
  rmSync(workDir, { recursive: true, force: true });
}

function main() {
  const launcherManifest = readJson(launcherManifestPath);
  const sharedManifest = readJson(join(repoRoot, "packages/shared/package.json"));
  const brokerManifest = readJson(join(repoRoot, "packages/broker/package.json"));
  const piPackageManifest = readJson(join(repoRoot, "packages/pi-package/package.json"));
  const piAiManifest = readJson(join(piMonoRoot, "packages/ai/package.json"));
  const piCodingAgentManifest = readJson(join(piMonoRoot, "packages/coding-agent/package.json"));

  const versions = {
    shared: sharedManifest.version,
    broker: brokerManifest.version,
    piPackage: piPackageManifest.version,
    piAi: piAiManifest.version,
    piCodingAgent: piCodingAgentManifest.version,
  };

  cleanup();
  resetDir(stageRoot);
  resetDir(vendoredNodeModulesRoot);
  writeFileSync(backupManifestPath, `${JSON.stringify(launcherManifest, null, 2)}\n`);

  try {
    vendorPackage(
      "@advaita/shared",
      stagePackage({
        sourceDir: join(repoRoot, "packages/shared"),
        includePaths: ["dist"],
        transformManifest: (manifest) => createSharedManifest(manifest, versions),
      }),
    );

    vendorPackage(
      "@advaita/broker",
      stagePackage({
        sourceDir: join(repoRoot, "packages/broker"),
        includePaths: ["dist"],
        transformManifest: (manifest) => createBrokerManifest(manifest, versions),
      }),
    );

    vendorPackage(
      "@advaita/pi-package",
      stagePackage({
        sourceDir: join(repoRoot, "packages/pi-package"),
        includePaths: ["dist"],
        transformManifest: (manifest) => createPiPackageManifest(manifest, versions),
      }),
    );

    vendorPackage(
      "@mariozechner/pi-coding-agent",
      stagePackage({
        sourceDir: join(piMonoRoot, "packages/coding-agent"),
        includePaths: ["dist"],
        transformManifest: (manifest) => createInternalPackageManifest(manifest),
      }),
    );

    writeJson(launcherManifestPath, createPublishManifest(launcherManifest, piCodingAgentManifest));
  } catch (error) {
    writeJson(launcherManifestPath, launcherManifest);
    cleanup();
    throw error;
  }
}

main();
