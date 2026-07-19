/**
 * Pack the npm tarball, install it into a temp app (so runtime deps resolve),
 * then run tests/packed-smoke.mjs against the installed bin.
 * Usage: node scripts/run-packed-smoke.mjs [--skip-render]
 */
import { mkdirSync, mkdtempSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const skipRender = process.argv.includes("--skip-render");
const packDir = mkdtempSync(join(tmpdir(), "yumoframe-pack-smoke-"));

try {
  const pack = spawnSync("pnpm", ["pack", `--pack-destination=${packDir}`], {
    cwd: root,
    encoding: "utf8",
    env: process.env,
  });
  if (pack.status !== 0) {
    throw new Error(`pnpm pack failed\n${pack.stdout}\n${pack.stderr}`);
  }

  const tarball = readdirSync(packDir).find((name) => name.endsWith(".tgz"));
  if (!tarball) throw new Error(`No tarball written to ${packDir}`);

  const appDir = join(packDir, "app");
  mkdirSync(appDir);
  writeFileSync(
    join(appDir, "package.json"),
    `${JSON.stringify({ name: "yumoframe-pack-smoke", private: true }, null, 2)}\n`,
  );
  const install = spawnSync("npm", ["install", join(packDir, tarball)], {
    cwd: appDir,
    encoding: "utf8",
    env: process.env,
  });
  if (install.status !== 0) {
    throw new Error(`npm install packed tarball failed\n${install.stdout}\n${install.stderr}`);
  }

  const bin = join(appDir, "node_modules", "yumoframe", "packages", "cli", "dist", "cli.js");
  const smokeArgs = [resolve(root, "tests", "packed-smoke.mjs"), bin];
  if (skipRender) smokeArgs.push("--skip-render");
  const smoke = spawnSync(process.execPath, smokeArgs, {
    cwd: root,
    encoding: "utf8",
    env: process.env,
    stdio: "inherit",
  });
  if (smoke.status !== 0) process.exit(smoke.status ?? 1);
} finally {
  rmSync(packDir, { recursive: true, force: true });
}
