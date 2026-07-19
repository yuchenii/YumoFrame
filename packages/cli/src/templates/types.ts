/** Metadata declared by one built-in runtime template. */
import type { YumoFrameConfig } from "../core/types.ts";

export interface TemplateManifest {
  schemaVersion: "yumoframe.template.v1";
  id: string;
  name: string;
  description: string;
  adapter: string;
  entry: string;
  compositionId: string;
  authoringGuide: string;
  schemas: {
    storyboard: string;
    project: string;
  };
  defaults: {
    storyboard: string;
  };
  presets: Record<string, string>;
}

/** A template compiled into this CLI. Runtime directories alone are not executable registrations. */
export interface TemplateRegistration {
  id: string;
  runtimeDirectory: string;
}

/** Framework-visible result of a template resolve command. */
export interface TemplateResolveResult {
  path: string;
  projectMdPath?: string;
  storyboardPath?: string;
  linesPath?: string;
  project: unknown;
  warnings: string[];
  aligned?: boolean;
}

/** Framework-visible result of an optional project Markdown sync. */
export interface TemplateSyncResult {
  projectPath: string;
  projectMdPath: string;
  storyboardPath: string;
  linesPath: string;
  sceneCount: number;
  lineCount: number;
  warnings: string[];
}

/** Project-relative JSON files owned by a Template at initialization. */
export type TemplateInitialFiles = Record<string, unknown>;

/** Resolved framework context passed into executable Adapter methods. */
export interface TemplateCommandContext {
  projectRoot: string;
  config: YumoFrameConfig;
  manifest: TemplateManifest;
  files: TemplateFiles;
}

/** Minimal executable surface compiled into the CLI for one built-in Template. */
export interface TemplateAdapter {
  id: string;
  defaultPreset?: string;
  createInitialFiles(): TemplateInitialFiles;
  resolve(
    context: TemplateCommandContext,
    options?: { align?: boolean | "auto" },
  ): TemplateResolveResult;
  validate(context: TemplateCommandContext): string[];
  validateResolved(context: TemplateCommandContext): string[];
  syncProject?(context: TemplateCommandContext, options?: { align?: boolean }): TemplateSyncResult;
  renderLayoutPreview?(context: TemplateCommandContext): { outputPath: string };
}

/** Fully resolved files used by commands and the universal authoring Skill. */
export interface TemplateFiles {
  adapter: string;
  entry: string;
  authoringGuide: string;
  storyboardSchema: string;
  projectSchema: string;
  defaultStoryboard: string;
  presets: Record<string, string>;
}
