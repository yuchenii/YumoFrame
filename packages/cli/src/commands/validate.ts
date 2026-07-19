/** Dispatch template validation and enforce preview/render preconditions. */
import { loadTemplateContext } from "../templates/registry.ts";

export function validateCurrentProject(start = process.cwd()): string[] {
  const context = loadTemplateContext(start);
  return context.adapter.validate(context);
}

export function assertCurrentProjectValid(start = process.cwd()): void {
  const context = loadTemplateContext(start);
  const errors = [
    ...context.adapter.validate(context),
    ...context.adapter.validateResolved(context),
  ];
  if (errors.length) throw new Error(errors.map((error) => `- ${error}`).join("\n"));
}
