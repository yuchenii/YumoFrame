/** Dispatch project resolution to the active built-in Template Adapter. */
import { loadTemplateContext } from "../templates/registry.ts";
import type { TemplateResolveResult } from "../templates/types.ts";

export function resolveProject(
  start = process.cwd(),
  options: { align?: boolean | "auto" } = {},
): TemplateResolveResult {
  const context = loadTemplateContext(start);
  return context.adapter.resolve(context, options);
}
