/** Sync human-readable markdown layers with JSON transcript/project artifacts. */
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { basename, resolve } from "node:path";
import { alignStoryboardLines, buildCharTimeline } from "@yumoframe/cli/media/align";
import { loadConfig } from "@yumoframe/cli/core/config";
import { parseTranscript } from "@yumoframe/cli/core/json";
import type { YumoFrameConfig } from "@yumoframe/cli/core/types";
import { parseProject } from "./json.ts";
import {
  formatProjectMd,
  parseProjectMd,
  storyboardFromParsedMd,
  storyboardFromProject,
} from "./project-md.ts";
import {
  flattenScenes,
  nestAlignedLines,
  resolveRotatingFlow,
  sanitizeStoryboard,
} from "./index.ts";
import type { RotatingFlowProject, Storyboard } from "./types.ts";

function pathOr(config: YumoFrameConfig, key: string, fallback: string): string {
  // Prefer config.paths[key]; fall back to the conventional filename.
  return config.paths?.[key] || fallback;
}

function attachVoice(storyboard: Storyboard, root: string, config: YumoFrameConfig): Storyboard {
  const voicePath = resolve(root, config.paths.voice);
  const voiceSource =
    config.processors.tts && config.paths.voice === config.paths.media ? "tts" : "user";
  // Preserve authored audio, but keep previously attached TTS audio in sync with config.
  if ((!storyboard.audio || storyboard.audio.source === "tts") && existsSync(voicePath)) {
    return { ...storyboard, audio: { src: config.paths.voice, source: voiceSource } };
  }
  return storyboard;
}

/** Align line times from transcript, or preserve/fallback times when transcript is missing. */
function alignStoryboard(
  storyboard: Storyboard,
  root: string,
  config: YumoFrameConfig,
  existing: RotatingFlowProject | null = null,
): { storyboard: Storyboard; warnings: string[] } {
  const warnings: string[] = [];
  const transcriptPath = resolve(root, pathOr(config, "transcript", "transcript.json"));
  const flat = flattenScenes(storyboard.scenes);
  if (!existsSync(transcriptPath)) {
    // No ASR data: reuse prior times by line index, else assign 0.4s slots.
    const previous = existing ? flattenScenes(storyboardFromProject(existing).scenes) : [];
    warnings.push(
      `transcript.json missing; ${previous.length ? "preserved existing line times by position" : "assigned fallback line times"}`,
    );
    let cursor = 0;
    const lines = flat.map((line, index) => {
      const prior = previous[index];
      if (typeof prior?.start === "number" && typeof prior?.end === "number") {
        cursor = prior.end;
        return { ...line, start: prior.start, end: prior.end };
      }
      if (typeof line.start === "number" && typeof line.end === "number") return line;
      const start = cursor;
      const end = cursor + 0.4;
      cursor = end;
      return { ...line, start, end };
    });
    return { storyboard: nestAlignedLines(storyboard, lines), warnings };
  }
  // Match flat lines to the character timeline from transcript.json.
  const transcript = parseTranscript(readFileSync(transcriptPath, "utf8"), transcriptPath);
  const timeline = buildCharTimeline(transcript);
  const aligned = alignStoryboardLines(flat, timeline);
  return { storyboard: nestAlignedLines(storyboard, aligned.lines), warnings: aligned.warnings };
}

/** Paths and counts produced by syncing project.md into JSON artifacts. */
export interface SyncProjectResult {
  projectPath: string;
  projectMdPath: string;
  storyboardPath: string;
  linesPath: string;
  sceneCount: number;
  lineCount: number;
  warnings: string[];
}

/**
 * Parse project.md, optionally align timings, and write storyboard/lines/project.json.
 * @param start Directory to search upward for `yumoframe.config.json` (default: cwd).
 * @param options.align When true (default), align line times from transcript or fallbacks.
 * @returns Written paths, scene/line counts, and warnings.
 */
export function syncProject(
  start = process.cwd(),
  { align = true }: { align?: boolean } = {},
): SyncProjectResult {
  const { root, config } = loadConfig(start);
  const projectMdPath = resolve(root, pathOr(config, "projectMd", "project.md"));
  const projectPath = resolve(root, pathOr(config, "project", "project.json"));
  if (!existsSync(projectMdPath)) throw new Error(`Missing ${projectMdPath}`);

  const parsed = parseProjectMd(readFileSync(projectMdPath, "utf8"));
  const existing = existsSync(projectPath)
    ? parseProject(readFileSync(projectPath, "utf8"), projectPath)
    : null;
  const warnings: string[] = [];

  // Carry resolved metadata from project.json when regenerating from markdown.
  let storyboard = storyboardFromParsedMd(parsed, {
    endOverview: existing?.endOverview !== false,
    source: existing?.source,
    theme: existing?.theme,
    duration: existing?.composition?.duration,
  });

  if (align) {
    const aligned = alignStoryboard(storyboard, root, config, existing);
    storyboard = aligned.storyboard;
    warnings.push(...aligned.warnings);
  } else if (existing) {
    // --no-align: copy prior start/end by line index; leave new lines untimed.
    const previous = flattenScenes(storyboardFromProject(existing).scenes);
    const flat = flattenScenes(storyboard.scenes).map((line, index) => {
      const prior = previous[index];
      if (prior && typeof prior.start === "number" && typeof prior.end === "number") {
        return { ...line, start: prior.start, end: prior.end };
      }
      return line;
    });
    storyboard = nestAlignedLines(storyboard, flat);
  }

  storyboard = attachVoice(storyboard, root, config);
  // Fallback: keep voice src from existing project when file attach did not run.
  if (existing?.audio?.voice && !storyboard.audio) {
    storyboard.audio = {
      src: existing.audio.voice.src,
      source: existing.audio.voice.source ?? "user",
    };
  }
  storyboard = sanitizeStoryboard(storyboard);

  const storyboardPath = resolve(root, pathOr(config, "storyboard", "storyboard.json"));
  const linesPath = resolve(root, pathOr(config, "lines", "lines.json"));
  const flatLines = flattenScenes(storyboard.scenes);
  writeFileSync(storyboardPath, `${JSON.stringify(storyboard, null, 2)}\n`);
  writeFileSync(
    linesPath,
    `${JSON.stringify(
      {
        version: storyboard.version || "0.1.0",
        template: storyboard.template || "rotating-flow",
        lines: flatLines,
      },
      null,
      2,
    )}\n`,
  );

  // Resolve layout/timeline into project.json, then rewrite project.md from it.
  const project = resolveRotatingFlow(storyboard, config);
  writeFileSync(projectPath, `${JSON.stringify(project, null, 2)}\n`);
  writeFileSync(projectMdPath, formatProjectMd(project, { title: basename(root) }));

  return {
    projectPath,
    projectMdPath,
    storyboardPath,
    linesPath,
    sceneCount: storyboard.scenes.length,
    lineCount: flatLines.length,
    warnings,
  };
}
