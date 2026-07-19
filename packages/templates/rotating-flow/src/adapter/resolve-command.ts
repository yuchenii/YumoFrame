/** Resolve storyboard (+ optional transcript align) into project.json and related artifacts. */
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { basename, resolve } from "node:path";
import { alignStoryboardLines, buildCharTimeline } from "@yumoframe/cli/media/align";
import { loadConfig } from "@yumoframe/cli/core/config";
import { parseTranscript } from "@yumoframe/cli/core/json";
import { formatTranscriptMd } from "@yumoframe/cli/media/transcript-md";
import type { YumoFrameConfig } from "@yumoframe/cli/core/types";
import { parseProject, parseStoryboard } from "./json.ts";
import { formatProjectMd, storyboardFromProject } from "./project-md.ts";
import {
  flattenScenes,
  nestAlignedLines,
  resolveRotatingFlow,
  sanitizeStoryboard,
} from "./index.ts";
import type { RotatingFlowProject, Storyboard } from "./types.ts";

function pathOr(config: YumoFrameConfig, key: string, fallback: string): string {
  return config.paths?.[key] || fallback;
}

/**
 * Sanitize/align storyboard, write lines/project artifacts, and refresh project.md.
 * @param start Directory to search upward for `yumoframe.config.json` (default: cwd).
 * @param options.align `true` to force, `false` to skip, or `auto` when transcript.json exists.
 * @returns Paths, resolved project, warnings, and whether alignment ran.
 */
export function resolveProject(
  start = process.cwd(),
  { align = "auto" }: { align?: boolean | "auto" } = {},
): {
  path: string;
  projectMdPath: string;
  storyboardPath: string;
  linesPath: string;
  project: RotatingFlowProject;
  warnings: string[];
  aligned: boolean;
} {
  const { root, config } = loadConfig(start);
  const storyboardPath = resolve(root, pathOr(config, "storyboard", "storyboard.json"));
  const projectMdPath = resolve(root, pathOr(config, "projectMd", "project.md"));
  const projectPath = resolve(root, pathOr(config, "project", "project.json"));
  const transcriptMdPath = resolve(root, pathOr(config, "transcriptMd", "transcript.md"));
  const transcriptPath = resolve(root, pathOr(config, "transcript", "transcript.json"));
  const warnings: string[] = [];

  let storyboard: Storyboard;
  if (existsSync(storyboardPath)) {
    storyboard = parseStoryboard(readFileSync(storyboardPath, "utf8"), storyboardPath);
  } else if (existsSync(projectPath)) {
    // Authoring view missing: rebuild scenes from the last resolved project.
    storyboard = storyboardFromProject(
      parseProject(readFileSync(projectPath, "utf8"), projectPath),
    );
    warnings.push("storyboard.json missing; rebuilt authoring view from project.json");
  } else {
    throw new Error(`Missing ${storyboardPath} (author storyboard.json, then resolve)`);
  }

  // Prefer the configured synthesized track; preserve explicitly authored audio on media projects.
  const voicePath = resolve(root, config.paths.voice);
  const voiceSource =
    config.processors.tts && config.paths.voice === config.paths.media ? "tts" : "user";
  if ((voiceSource === "tts" || !storyboard.audio) && existsSync(voicePath)) {
    storyboard.audio = { src: config.paths.voice, source: voiceSource };
  }

  storyboard = sanitizeStoryboard(storyboard);

  const linesPath = resolve(root, pathOr(config, "lines", "lines.json"));
  // auto → align only when transcript.json is present; true forces, false skips.
  const shouldAlign = align === true || (align === "auto" && existsSync(transcriptPath));
  const transcript = existsSync(transcriptPath)
    ? parseTranscript(readFileSync(transcriptPath, "utf8"), transcriptPath)
    : undefined;
  if (align === true && !existsSync(transcriptPath)) {
    warnings.push("transcript.json missing; skipped align");
  }

  if (shouldAlign && transcript) {
    const timeline = buildCharTimeline(transcript);
    const flat = flattenScenes(storyboard.scenes);
    const aligned = alignStoryboardLines(flat, timeline);
    storyboard = nestAlignedLines(storyboard, aligned.lines);
    warnings.push(...aligned.warnings);
  }

  // TTS playback must not be cut off when the final spoken token ends before the audio track.
  const transcriptDuration = Number(transcript?.duration);
  if (storyboard.audio?.source === "tts" && Number.isFinite(transcriptDuration)) {
    storyboard.duration = Math.max(storyboard.duration ?? 0, transcriptDuration);
  }

  writeFileSync(storyboardPath, `${JSON.stringify(storyboard, null, 2)}\n`);
  writeFileSync(
    linesPath,
    `${JSON.stringify(
      {
        version: storyboard.version || "0.1.0",
        template: storyboard.template || "rotating-flow",
        lines: flattenScenes(storyboard.scenes),
      },
      null,
      2,
    )}\n`,
  );

  const project = resolveRotatingFlow(storyboard, config);
  writeFileSync(projectPath, `${JSON.stringify(project, null, 2)}\n`);
  writeFileSync(projectMdPath, formatProjectMd(project, { title: basename(root) }));

  // Bootstrap transcript.md from JSON when the markdown layer is absent.
  if (existsSync(transcriptPath) && !existsSync(transcriptMdPath)) {
    writeFileSync(transcriptMdPath, formatTranscriptMd(transcript!));
  }

  return {
    path: projectPath,
    projectMdPath,
    storyboardPath,
    linesPath,
    project,
    warnings,
    aligned: Boolean(shouldAlign && existsSync(transcriptPath)),
  };
}
