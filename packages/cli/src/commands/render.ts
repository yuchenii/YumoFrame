/** Render the Remotion composition for the current YumoFrame project. */
import { resolve } from "node:path";
import { runTemplate } from "../remotion/runtime.ts";
import { loadTemplateContext } from "../templates/registry.ts";
import { assertCurrentProjectValid } from "./validate.ts";

/**
 * Validate the project, then launch the template `render` script.
 * @param start Directory to search upward for `yumoframe.config.json` (default: cwd).
 * @returns Result of the template `render` invocation.
 */
export function renderProject(start = process.cwd()) {
  // Fail fast if project.json is missing or has no resolved scenes.
  assertCurrentProjectValid(start);
  const context = loadTemplateContext(start);
  return runTemplate("render", {
    projectRoot: context.projectRoot,
    templateDir: context.templateRoot,
    entry: context.manifest.entry,
    composition: context.manifest.compositionId,
    output: resolve(context.projectRoot, context.config.paths.output),
    projectFile: resolve(context.projectRoot, context.config.paths.project),
  });
}
