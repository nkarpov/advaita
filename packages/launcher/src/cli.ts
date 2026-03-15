#!/usr/bin/env node
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { parseCliArgs, renderHelpText, CliUsageError } from "./args.js";
import { formatDoctorReport, hasDoctorErrors, runDoctor } from "./doctor.js";
import { launchAdvaita } from "./launcher.js";
import { resolveCurrentPackage } from "./runtime-resolution.js";

async function printVersion(json: boolean): Promise<void> {
  const launcher = resolveCurrentPackage(import.meta.url);
  const packageJson = JSON.parse(await readFile(join(launcher.packageRoot, "package.json"), "utf8"));
  if (json) {
    console.log(JSON.stringify({ name: packageJson.name, version: packageJson.version }, null, 2));
    return;
  }
  console.log(`${packageJson.name}@${packageJson.version}`);
}

async function main(): Promise<number> {
  try {
    const parsed = parseCliArgs(process.argv.slice(2));
    switch (parsed.kind) {
      case "help":
        console.log(renderHelpText());
        return 0;
      case "version":
        await printVersion(parsed.json);
        return 0;
      case "doctor": {
        const report = await runDoctor();
        if (parsed.json) {
          console.log(JSON.stringify(report, null, 2));
        } else {
          console.log(formatDoctorReport(report));
        }
        return hasDoctorErrors(report) ? 1 : 0;
      }
      case "launch":
        return await launchAdvaita(parsed);
    }
  } catch (error) {
    if (error instanceof CliUsageError) {
      console.error(error.message);
      console.error("");
      console.error(renderHelpText());
      return 2;
    }
    console.error(error instanceof Error ? error.message : String(error));
    return 1;
  }
}

void main().then((code) => {
  process.exitCode = code;
});
