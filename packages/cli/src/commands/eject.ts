/** Copy the runtime template into the project and switch config to local source. */
import { cpSync, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { basename, resolve } from "node:path";
import { parseConfig } from "../core/json.ts";
import { loadTemplateContext } from "../templates/registry.ts";

/**
 * Eject the configured runtime template into `templates/<name>` and point config at it.
 * @param start Directory to search upward for `yumoframe.config.json` (default: cwd).
 * @returns Absolute path of the ejected local template directory.
 */
export function ejectProject(start = process.cwd()) {
  const context = loadTemplateContext(start);
  const { projectRoot: root, config } = context;
  const destinationRelative = `templates/${config.template}`;
  const destination = resolve(root, destinationRelative);
  if (existsSync(destination)) throw new Error(`Local template already exists: ${destination}`);

  mkdirSync(resolve(root, "templates"), { recursive: true });
  if (config.templateSource === "local")
    throw new Error(`Template ${config.template} is already local: ${context.templateRoot}`);
  // Copy the validated packaged template; skip install/build artifacts.
  cpSync(context.templateRoot, destination, {
    recursive: true,
    filter: (source) => !["node_modules", "out", "dist"].includes(basename(source)),
  });
  // Point the project at the ejected copy via local templateSource.
  const configPath = resolve(root, "yumoframe.config.json");
  const next = {
    ...parseConfig(readFileSync(configPath, "utf8"), configPath),
    templateSource: "local",
    templatePath: destinationRelative,
  };
  writeFileSync(configPath, `${JSON.stringify(next, null, 2)}\n`);
  return destination;
}
