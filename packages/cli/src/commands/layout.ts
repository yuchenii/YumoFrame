/** Dispatch the optional layout preview capability to the active Template Adapter. */
import { loadTemplateContext } from "../templates/registry.ts";

export function layoutProject(start = process.cwd()): { outputPath: string } {
  const context = loadTemplateContext(start);
  const adapter = context.adapter;
  if (!adapter.renderLayoutPreview)
    throw new Error(`Template ${adapter.id} does not support layout previews`);
  return adapter.renderLayoutPreview(context);
}
