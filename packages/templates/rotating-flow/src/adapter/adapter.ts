/** Executable Adapter for the built-in rotating-flow Template. */
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import type { TemplateAdapter, TemplateInitialFiles } from "@yumoframe/cli/templates/types";
import { parseProject } from "./json.ts";
import { layoutProject } from "./layout-command.ts";
import { resolveProject } from "./resolve-command.ts";
import { syncProject } from "./sync-command.ts";
import { validateCurrentProject } from "./validate-command.ts";
import { DEFAULT_FONT_FAMILY } from "../layout-constants.ts";

function createInitialFiles(): TemplateInitialFiles {
  const line = { start: 0, end: 0.8, segments: [{ text: "示例", highlight: false }] };
  return {
    "lines.json": { version: "0.1.0", template: "rotating-flow", lines: [line] },
    "storyboard.json": {
      version: "0.1.0",
      template: "rotating-flow",
      endOverview: true,
      scenes: [{ lines: [line] }],
    },
    "project.json": {
      version: "0.1.0",
      template: "rotating-flow",
      endOverview: true,
      composition: { width: 1080, height: 1920, fps: 30, duration: 1, background: "#000000" },
      source: { type: "text", text: "" },
      theme: {
        fontFamily: DEFAULT_FONT_FAMILY,
        textColor: "#FFFFFF",
        highlightColor: "#65F2A3",
        cursorColor: "#FFFFFF",
        dimCursorColor: "#7A7A7A",
      },
      timeline: { virtualCanvas: { width: 40000, height: 40000 }, scenes: [] },
    },
  };
}

export const rotatingFlowAdapter: TemplateAdapter = {
  id: "rotating-flow",
  createInitialFiles,
  resolve: (context, options) => resolveProject(context.projectRoot, options),
  validate: (context) => validateCurrentProject(context.projectRoot),
  validateResolved: (context) => {
    const projectPath = resolve(context.projectRoot, context.config.paths.project);
    if (!existsSync(projectPath))
      return [`missing ${context.config.paths.project}; run yumoframe resolve first`];
    const project = parseProject(readFileSync(projectPath, "utf8"), projectPath);
    return project.timeline.scenes.length
      ? []
      : [`${context.config.paths.project} has no resolved scenes; run yumoframe resolve first`];
  },
  syncProject: (context, options) => syncProject(context.projectRoot, options),
  renderLayoutPreview: (context) => layoutProject(context.projectRoot),
};

export { renderLayoutSvg } from "./layout-command.ts";
export {
  formatProjectMd,
  markdownToSegments,
  parseProjectMd,
  segmentsToMarkdown,
} from "./project-md.ts";
export { parseProject } from "./json.ts";
export {
  lineUnits,
  resolveRotatingFlow,
  sanitizeStoryboard,
  stripPunctuation,
  validateProject,
  validateStoryboard,
} from "./index.ts";
export {
  fitLineFontSize,
  LAYOUT_ASCII_UNITS,
  MAX_BLOCK_WIDTH,
  layoutRotatingFlowProject,
} from "./layout.ts";
