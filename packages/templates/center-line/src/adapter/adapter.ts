import type { TemplateAdapter, TemplateInitialFiles } from "@yumoframe/cli/templates/types";
import { resolveCenterLine, validateCenterLine, validateResolvedCenterLine } from "./command.ts";

function createInitialFiles(): TemplateInitialFiles {
  return {
    "storyboard.json": {
      version: "0.1.0",
      template: "center-line",
      lines: [{ id: "line-001", text: "第一句话", start: 0, end: 1.4, emphasis: [] }],
    },
    "project.json": {
      version: "0.1.0",
      template: "center-line",
      preset: "minimal-dark",
      composition: { width: 1080, height: 1920, fps: 30, duration: 1, background: "#101114" },
      style: {},
      lines: [],
    },
  };
}

export const centerLineAdapter: TemplateAdapter = {
  id: "center-line",
  defaultPreset: "minimal-dark",
  createInitialFiles,
  resolve: resolveCenterLine,
  validate: validateCenterLine,
  validateResolved: validateResolvedCenterLine,
};
