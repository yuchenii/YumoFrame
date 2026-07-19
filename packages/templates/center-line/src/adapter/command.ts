import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { alignStoryboardLines, buildCharTimeline } from "@yumoframe/cli/media/align";
import { parseTranscript } from "@yumoframe/cli/core/json";
import type { TemplateCommandContext, TemplateResolveResult } from "@yumoframe/cli/templates/types";
import {
  parseCenterLineProject,
  parseCenterLineStoryboard,
  validateCenterLineProject,
  validateCenterLineStoryboard,
} from "./index.ts";
import type { CenterLineProject, CenterLineStyle } from "./types.ts";

const pathOr = (context: TemplateCommandContext, key: string, fallback: string) =>
  context.config.paths[key] || fallback;

function readStyle(context: TemplateCommandContext): { id: string; style: CenterLineStyle } {
  const id = context.config.preset ?? "minimal-dark";
  const path = context.files.presets[id];
  if (!path) throw new Error(`Unsupported preset for center-line: ${id}`);
  const value = JSON.parse(readFileSync(path, "utf8")) as {
    schemaVersion?: unknown;
    id?: unknown;
    style?: Record<string, unknown>;
  };
  const style = value.style;
  const strings = ["background", "textColor", "emphasisColor", "fontFamily", "transition"];
  if (
    value.schemaVersion !== "yumoframe.preset.v1" ||
    value.id !== id ||
    !style ||
    strings.some((key) => typeof style[key] !== "string")
  ) {
    throw new Error(`Invalid center-line preset: ${id}`);
  }
  if (
    !Number.isFinite(style.fontSize) ||
    Number(style.fontSize) <= 0 ||
    !Number.isInteger(style.historyLines) ||
    Number(style.historyLines) < 0 ||
    !Number.isFinite(style.echoOpacity) ||
    Number(style.echoOpacity) < 0 ||
    Number(style.echoOpacity) > 1
  ) {
    throw new Error(`Invalid center-line preset style: ${id}`);
  }
  return { id, style: style as unknown as CenterLineStyle };
}

export function resolveCenterLine(
  context: TemplateCommandContext,
  { align = "auto" }: { align?: boolean | "auto" } = {},
): TemplateResolveResult {
  const storyboardPath = resolve(
    context.projectRoot,
    pathOr(context, "storyboard", "storyboard.json"),
  );
  const projectPath = resolve(context.projectRoot, context.config.paths.project);
  const transcriptPath = resolve(context.projectRoot, context.config.paths.transcript);
  if (!existsSync(storyboardPath)) throw new Error(`Missing ${storyboardPath}`);
  let storyboard = parseCenterLineStoryboard(readFileSync(storyboardPath, "utf8"), storyboardPath);
  const warnings: string[] = [];
  const shouldAlign = align === true || (align === "auto" && existsSync(transcriptPath));
  let transcriptDuration = 0;
  if (align === true && !existsSync(transcriptPath))
    warnings.push("transcript.json missing; skipped align");
  if (shouldAlign && existsSync(transcriptPath)) {
    const transcript = parseTranscript(readFileSync(transcriptPath, "utf8"), transcriptPath);
    transcriptDuration =
      Number(transcript.duration) ||
      Math.max(0, ...transcript.segments.map((segment) => segment.end));
    const aligned = alignStoryboardLines(
      storyboard.lines.map((line) => ({
        ...line,
        segments: [{ text: line.text, highlight: false }],
      })),
      buildCharTimeline(transcript),
    );
    storyboard = {
      ...storyboard,
      lines: aligned.lines.map(({ segments: _segments, ...line }) => line),
    };
    warnings.push(...aligned.warnings);
  }
  const errors = validateCenterLineStoryboard(storyboard);
  if (errors.length) throw new Error(errors.map((error) => `- ${error}`).join("\n"));
  const missingTiming = storyboard.lines.flatMap((line, index) =>
    Number.isFinite(line.start) && Number.isFinite(line.end)
      ? []
      : [
          `lines[${index}] needs numeric start/end; provide text-only timing or align from transcript.json`,
        ],
  );
  if (missingTiming.length) throw new Error(missingTiming.map((error) => `- ${error}`).join("\n"));
  const { id: preset, style: presetStyle } = readStyle(context);
  const style: CenterLineStyle = { ...presetStyle, ...storyboard.style };
  const width = context.config.render.width ?? 1080;
  const height = context.config.render.height ?? 1920;
  const fps = context.config.render.fps ?? 30;
  const lastEnd = storyboard.lines.at(-1)?.end ?? 0;
  const project: CenterLineProject = {
    version: "0.1.0",
    template: "center-line",
    preset,
    composition: {
      width,
      height,
      fps,
      duration: Math.max(1, lastEnd + 0.5, transcriptDuration),
      background: style.background,
    },
    style,
    lines: storyboard.lines as CenterLineProject["lines"],
  };
  const voicePath = resolve(context.projectRoot, context.config.paths.voice);
  if (existsSync(voicePath)) {
    const source =
      context.config.processors.tts && context.config.paths.voice === context.config.paths.media
        ? "tts"
        : "user";
    project.audio = { voice: { src: context.config.paths.voice, start: 0, volume: 1, source } };
  }
  writeFileSync(storyboardPath, `${JSON.stringify(storyboard, null, 2)}\n`);
  writeFileSync(projectPath, `${JSON.stringify(project, null, 2)}\n`);
  return {
    path: projectPath,
    storyboardPath,
    project,
    warnings,
    aligned: shouldAlign && existsSync(transcriptPath),
  };
}

export function validateCenterLine(context: TemplateCommandContext): string[] {
  const storyboardPath = resolve(
    context.projectRoot,
    pathOr(context, "storyboard", "storyboard.json"),
  );
  const projectPath = resolve(context.projectRoot, context.config.paths.project);
  const errors = existsSync(storyboardPath)
    ? validateCenterLineStoryboard(
        parseCenterLineStoryboard(readFileSync(storyboardPath, "utf8"), storyboardPath),
      )
    : [`missing ${pathOr(context, "storyboard", "storyboard.json")}`];
  if (existsSync(projectPath))
    errors.push(
      ...validateCenterLineProject(
        parseCenterLineProject(readFileSync(projectPath, "utf8"), projectPath),
      ),
    );
  return [...new Set(errors)];
}

export function validateResolvedCenterLine(context: TemplateCommandContext): string[] {
  const projectPath = resolve(context.projectRoot, context.config.paths.project);
  if (!existsSync(projectPath))
    return [`missing ${context.config.paths.project}; run yumoframe resolve first`];
  const project = parseCenterLineProject(readFileSync(projectPath, "utf8"), projectPath);
  return project.lines.length
    ? []
    : [`${context.config.paths.project} has no resolved lines; run yumoframe resolve first`];
}
