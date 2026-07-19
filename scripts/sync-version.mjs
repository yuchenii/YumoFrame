/**
 * Sync packages/cli/src/commands/init.ts's generated-config `version` to package.json's version.
 *
 * By default only `version` is updated. Pass `--runtime` to ALSO bump `runtimeVersion`
 * (do this only when processors Python changed — it invalidates users' cached venvs).
 *
 * Only the config block is touched; the lines/storyboard/project stub `version` fields
 * (data-format version) are left alone.
 */
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const syncRuntime = process.argv.slice(2).includes("--runtime");

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const { version } = JSON.parse(readFileSync(resolve(root, "package.json"), "utf8"));

const initPath = resolve(root, "packages", "cli", "src", "commands", "init.ts");
const original = readFileSync(initPath, "utf8");

// Config `version` is the one right after `framework: "yumoframe",` — not the stub 0.1.0 fields.
const versionPattern = /(framework: "yumoframe",\s*version: )"[^"]*"/;
if (!versionPattern.test(original)) {
  throw new Error("sync-version: could not find the config version in init.ts");
}
let source = original.replace(versionPattern, `$1"${version}"`);

if (syncRuntime) {
  const runtimePattern = /(runtimeVersion: )"[^"]*"/;
  if (!runtimePattern.test(source)) {
    throw new Error("sync-version: could not find runtimeVersion in init.ts");
  }
  source = source.replace(runtimePattern, `$1"${version}"`);
}

const scope = syncRuntime ? "version + runtimeVersion" : "version";
if (source === original) {
  console.log(`init.ts ${scope} already at ${version}`);
} else {
  writeFileSync(initPath, source);
  console.log(`Synced init.ts ${scope} → ${version}`);
}

const cliPackagePath = resolve(root, "packages", "cli", "package.json");
const cliPackage = JSON.parse(readFileSync(cliPackagePath, "utf8"));
if (cliPackage.version !== version) {
  cliPackage.version = version;
  writeFileSync(cliPackagePath, `${JSON.stringify(cliPackage, null, 2)}\n`);
  console.log(`Synced packages/cli/package.json version → ${version}`);
} else {
  console.log(`packages/cli/package.json version already at ${version}`);
}
