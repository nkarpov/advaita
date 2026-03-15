import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

export interface ResolvedPackageInfo {
  specifier: string;
  entrypoint: string;
  packageRoot: string;
  packageJson: {
    name?: string;
    version?: string;
    bin?: string | Record<string, string>;
    main?: string;
    exports?: unknown;
  };
}

function findPackageRoot(start: string): string {
  let current = dirname(start);
  while (true) {
    const candidate = join(current, "package.json");
    if (existsSync(candidate)) {
      return current;
    }
    const parent = dirname(current);
    if (parent === current) {
      throw new Error(`Could not locate package.json above ${start}`);
    }
    current = parent;
  }
}

function resolvePackageEntrypoint(packageRoot: string, packageJson: ResolvedPackageInfo["packageJson"]): string {
  const rootExport = packageJson.exports && typeof packageJson.exports === "object"
    ? (packageJson.exports as Record<string, unknown>)["."]
    : packageJson.exports;

  if (typeof rootExport === "string") {
    return join(packageRoot, rootExport);
  }

  if (rootExport && typeof rootExport === "object") {
    const exportRecord = rootExport as Record<string, unknown>;
    if (typeof exportRecord.import === "string") {
      return join(packageRoot, exportRecord.import);
    }
    if (typeof exportRecord.default === "string") {
      return join(packageRoot, exportRecord.default);
    }
  }

  if (typeof packageJson.main === "string") {
    return join(packageRoot, packageJson.main);
  }

  throw new Error(`Package at ${packageRoot} does not expose an importable entrypoint`);
}

function loadPackageInfoFromRoot(specifier: string, packageRoot: string): ResolvedPackageInfo {
  const packageJsonPath = join(packageRoot, "package.json");
  const packageJson = JSON.parse(readFileSync(packageJsonPath, "utf8"));
  return {
    specifier,
    packageRoot,
    packageJson,
    entrypoint: resolvePackageEntrypoint(packageRoot, packageJson),
  };
}

function loadPackageInfo(specifier: string, entrypoint: string): ResolvedPackageInfo {
  return loadPackageInfoFromRoot(specifier, findPackageRoot(entrypoint));
}

function packagePathSegments(specifier: string): string[] {
  return specifier.startsWith("@") ? specifier.split("/") : [specifier];
}

function resolveVendoredPackage(specifier: string): ResolvedPackageInfo | undefined {
  const currentPackage = resolveCurrentPackage(import.meta.url);
  const packageRoot = join(currentPackage.packageRoot, "vendor", "node_modules", ...packagePathSegments(specifier));
  const packageJsonPath = join(packageRoot, "package.json");
  if (!existsSync(packageJsonPath)) {
    return undefined;
  }
  return loadPackageInfoFromRoot(specifier, packageRoot);
}

export function resolveInstalledPackage(specifier: string): ResolvedPackageInfo {
  return resolveVendoredPackage(specifier) ?? loadPackageInfo(specifier, fileURLToPath(import.meta.resolve(specifier)));
}

export function resolveCurrentPackage(importMetaUrl: string, specifier = "@nickkarpov/advaita"): ResolvedPackageInfo {
  return loadPackageInfo(specifier, fileURLToPath(importMetaUrl));
}

export function resolvePackageBin(packageInfo: ResolvedPackageInfo, binName?: string): string {
  const bin = packageInfo.packageJson.bin;
  if (!bin) {
    throw new Error(`Package ${packageInfo.specifier} does not declare a bin`);
  }
  if (typeof bin === "string") {
    return join(packageInfo.packageRoot, bin);
  }
  const selected = binName ? bin[binName] : Object.values(bin)[0];
  if (!selected) {
    throw new Error(`Package ${packageInfo.specifier} does not declare bin ${binName ?? "<default>"}`);
  }
  return join(packageInfo.packageRoot, selected);
}

export async function importResolvedPackageModule<T>(specifier: string): Promise<T> {
  const packageInfo = resolveInstalledPackage(specifier);
  return await import(pathToFileURL(packageInfo.entrypoint).href) as T;
}

export function resolvePiRuntimeArtifacts(): {
  packageInfo: ResolvedPackageInfo;
  cliPath: string;
  typesPath: string;
} {
  const packageInfo = resolveInstalledPackage("@mariozechner/pi-coding-agent");
  return {
    packageInfo,
    cliPath: resolvePackageBin(packageInfo, "pi"),
    typesPath: join(packageInfo.packageRoot, "dist", "core", "extensions", "types.d.ts"),
  };
}

export function resolvePiPackageArtifacts(): {
  packageInfo: ResolvedPackageInfo;
  extensionEntrypoint: string;
} {
  const packageInfo = resolveInstalledPackage("@advaita/pi-package");
  return {
    packageInfo,
    extensionEntrypoint: packageInfo.entrypoint,
  };
}

export function resolveBrokerArtifacts(): {
  packageInfo: ResolvedPackageInfo;
  cliPath: string;
} {
  const packageInfo = resolveInstalledPackage("@advaita/broker");
  return {
    packageInfo,
    cliPath: resolvePackageBin(packageInfo, "advaita-broker"),
  };
}

export function resolveSharedArtifacts(): { packageInfo: ResolvedPackageInfo } {
  return {
    packageInfo: resolveInstalledPackage("@advaita/shared"),
  };
}

export function missingPiSyncApis(typesFileContents: string): string[] {
  const requiredApis = ["replaceSessionContents", "importSessionEntries", "continueSession"];
  return requiredApis.filter((api) => !typesFileContents.includes(api));
}
