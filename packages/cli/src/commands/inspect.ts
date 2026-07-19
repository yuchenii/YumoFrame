/** Return the resolved machine-readable project and Template Context. */
import { readFileSync } from "node:fs";
import { readJsonFile } from "../core/json.ts";
import { loadTemplateContext } from "../templates/registry.ts";

export function inspectProject(start = process.cwd()) {
  const context = loadTemplateContext(start);
  return {
    projectRoot: context.projectRoot,
    config: context.config,
    template: {
      id: context.manifest.id,
      source: context.config.templateSource,
      manifest: context.manifest,
      guide: readFileSync(context.files.authoringGuide, "utf8"),
      schemas: {
        storyboard: readJsonFile(context.files.storyboardSchema),
        project: readJsonFile(context.files.projectSchema),
      },
      defaultStoryboard: readJsonFile(context.files.defaultStoryboard),
      preset: context.config.preset
        ? readJsonFile(context.files.presets[context.config.preset]!)
        : null,
      capabilities: {
        syncProject: Boolean(context.adapter.syncProject),
        layoutPreview: Boolean(context.adapter.renderLayoutPreview),
      },
    },
  };
}
