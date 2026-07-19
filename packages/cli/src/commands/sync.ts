/** Dispatch framework and template-owned sync capabilities. */
import { loadTemplateContext } from "../templates/registry.ts";
import type { TemplateSyncResult } from "../templates/types.ts";
import { exportTranscriptMd, syncTranscript } from "./transcript-sync.ts";

export { exportTranscriptMd, syncTranscript };

export type SyncTarget = "all" | "transcript" | "project";
export interface SyncResults {
  transcript?: ReturnType<typeof syncTranscript>;
  project?: TemplateSyncResult;
  /** Set when `all` skips project sync because the template has no project.md layer. */
  skippedProject?: string;
}

export function syncProject(
  start = process.cwd(),
  options: { align?: boolean } = {},
): TemplateSyncResult {
  const context = loadTemplateContext(start);
  const adapter = context.adapter;
  if (!adapter.syncProject)
    throw new Error(`Template ${adapter.id} does not support project Markdown sync`);
  return adapter.syncProject(context, options);
}

/**
 * Sync requested layers.
 * For `all`, project Markdown sync is skipped (not failed) when the template lacks it.
 * Explicit `project` still throws if unsupported.
 */
export function syncProjectFiles(
  start = process.cwd(),
  targets: SyncTarget[] = ["all"],
  options: { align?: boolean } = {},
): SyncResults {
  const results: SyncResults = {};
  const wantTranscript = targets.includes("transcript") || targets.includes("all");
  const wantProject = targets.includes("project") || targets.includes("all");
  const projectRequired = targets.includes("project") && !targets.includes("all");

  if (wantTranscript) results.transcript = syncTranscript(start);
  if (wantProject) {
    const context = loadTemplateContext(start);
    if (!context.adapter.syncProject) {
      if (projectRequired) {
        throw new Error(`Template ${context.adapter.id} does not support project Markdown sync`);
      }
      results.skippedProject = `Template ${context.adapter.id} does not support project Markdown sync; skipped`;
    } else {
      results.project = context.adapter.syncProject(context, options);
    }
  }
  return results;
}
