/** Sync human-readable markdown layers with JSON transcript/project artifacts. */
import {existsSync, readFileSync, writeFileSync} from 'node:fs';
import {basename, resolve} from 'node:path';
import {alignStoryboardLines, buildCharTimeline} from '../align.js';
import {flattenScenes, nestAlignedLines, resolveComedyText, sanitizeStoryboard} from '../comedy-text.js';
import {loadConfig} from '../config.js';
import {parseProject, parseTranscript} from '../json.js';
import {formatProjectMd, parseProjectMd, storyboardFromParsedMd, storyboardFromProject} from '../project-md.js';
import {applyTranscriptMd, formatTranscriptMd, parseTranscriptMd} from '../transcript-md.js';
import type {Storyboard, Transcript, YumoFrameConfig, YumoFrameProject} from '../types.js';

function pathOr(config: YumoFrameConfig, key: string, fallback: string): string {
  // Prefer config.paths[key]; fall back to the conventional filename.
  return config.paths?.[key] || fallback;
}

function attachVoice(storyboard: Storyboard, root: string, config: YumoFrameConfig): Storyboard {
  const voicePath = resolve(root, config.paths.voice);
  // Only attach when storyboard has no audio yet and the voice file is on disk.
  if (!storyboard.audio && existsSync(voicePath)) {
    return {...storyboard, audio: {src: config.paths.voice, source: 'user'}};
  }
  return storyboard;
}

/** Align line times from transcript, or preserve/fallback times when transcript is missing. */
function alignStoryboard(
  storyboard: Storyboard,
  root: string,
  config: YumoFrameConfig,
  existing: YumoFrameProject | null = null,
): {storyboard: Storyboard; warnings: string[]} {
  const warnings: string[] = [];
  const transcriptPath = resolve(root, pathOr(config, 'transcript', 'transcript.json'));
  const flat = flattenScenes(storyboard.scenes);
  if (!existsSync(transcriptPath)) {
    // No ASR data: reuse prior times by line index, else assign 0.4s slots.
    const previous = existing ? flattenScenes(storyboardFromProject(existing).scenes) : [];
    warnings.push(`transcript.json missing; ${previous.length ? 'preserved existing line times by position' : 'assigned fallback line times'}`);
    let cursor = 0;
    const lines = flat.map((line, index) => {
      const prior = previous[index];
      if (typeof prior?.start === 'number' && typeof prior?.end === 'number') {
        cursor = prior.end;
        return {...line, start: prior.start, end: prior.end};
      }
      if (typeof line.start === 'number' && typeof line.end === 'number') return line;
      const start = cursor;
      const end = cursor + 0.4;
      cursor = end;
      return {...line, start, end};
    });
    return {storyboard: nestAlignedLines(storyboard, lines), warnings};
  }
  // Match flat lines to the character timeline from transcript.json.
  const transcript = parseTranscript(readFileSync(transcriptPath, 'utf8'), transcriptPath);
  const timeline = buildCharTimeline(transcript);
  const aligned = alignStoryboardLines(flat, timeline);
  return {storyboard: nestAlignedLines(storyboard, aligned.lines), warnings: aligned.warnings};
}

/**
 * Apply transcript.md edits onto transcript.json and rewrite both files.
 * @param start Directory to search upward for `yumoframe.config.json` (default: cwd).
 * @returns Transcript paths and segment count after sync.
 */
export function syncTranscript(start = process.cwd()): {transcriptPath: string; transcriptMdPath: string; segments: number} {
  const {root, config} = loadConfig(start);
  const transcriptPath = resolve(root, pathOr(config, 'transcript', 'transcript.json'));
  const transcriptMdPath = resolve(root, pathOr(config, 'transcriptMd', 'transcript.md'));
  if (!existsSync(transcriptPath)) throw new Error(`Missing ${transcriptPath}`);
  if (!existsSync(transcriptMdPath)) throw new Error(`Missing ${transcriptMdPath}`);

  // Markdown is the edit surface; JSON is the machine source of truth after apply.
  const transcript = parseTranscript(readFileSync(transcriptPath, 'utf8'), transcriptPath);
  const parsed = parseTranscriptMd(readFileSync(transcriptMdPath, 'utf8'));
  const next = applyTranscriptMd(transcript, parsed);
  writeFileSync(transcriptPath, `${JSON.stringify(next, null, 2)}\n`);
  writeFileSync(transcriptMdPath, formatTranscriptMd(next));
  return {transcriptPath, transcriptMdPath, segments: next.segments.length};
}

/**
 * Export transcript.json to transcript.md (markdown authoring view).
 * @param start Directory to search upward for `yumoframe.config.json` (default: cwd).
 * @returns Path of the written transcript.md.
 */
export function exportTranscriptMd(start = process.cwd()): {transcriptMdPath: string} {
  const {root, config} = loadConfig(start);
  const transcriptPath = resolve(root, pathOr(config, 'transcript', 'transcript.json'));
  const transcriptMdPath = resolve(root, pathOr(config, 'transcriptMd', 'transcript.md'));
  if (!existsSync(transcriptPath)) throw new Error(`Missing ${transcriptPath}`);
  // One-way: JSON → markdown (does not read existing .md).
  const transcript = parseTranscript(readFileSync(transcriptPath, 'utf8'), transcriptPath);
  writeFileSync(transcriptMdPath, formatTranscriptMd(transcript));
  return {transcriptMdPath};
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
export function syncProject(start = process.cwd(), {align = true}: {align?: boolean} = {}): SyncProjectResult {
  const {root, config} = loadConfig(start);
  const projectMdPath = resolve(root, pathOr(config, 'projectMd', 'project.md'));
  const projectPath = resolve(root, pathOr(config, 'project', 'project.json'));
  if (!existsSync(projectMdPath)) throw new Error(`Missing ${projectMdPath}`);

  const parsed = parseProjectMd(readFileSync(projectMdPath, 'utf8'));
  const existing = existsSync(projectPath) ? parseProject(readFileSync(projectPath, 'utf8'), projectPath) : null;
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
      if (prior && typeof prior.start === 'number' && typeof prior.end === 'number') {
        return {...line, start: prior.start, end: prior.end};
      }
      return line;
    });
    storyboard = nestAlignedLines(storyboard, flat);
  }

  storyboard = attachVoice(storyboard, root, config);
  // Fallback: keep voice src from existing project when file attach did not run.
  if (existing?.audio?.voice && !storyboard.audio) {
    storyboard.audio = {src: existing.audio.voice.src, source: existing.audio.voice.source ?? 'user'};
  }
  storyboard = sanitizeStoryboard(storyboard);

  const storyboardPath = resolve(root, pathOr(config, 'storyboard', 'storyboard.json'));
  const linesPath = resolve(root, pathOr(config, 'lines', 'lines.json'));
  const flatLines = flattenScenes(storyboard.scenes);
  writeFileSync(storyboardPath, `${JSON.stringify(storyboard, null, 2)}\n`);
  writeFileSync(linesPath, `${JSON.stringify({
    version: storyboard.version || '0.1.0',
    template: storyboard.template || 'comedy-text',
    lines: flatLines,
  }, null, 2)}\n`);

  // Resolve layout/timeline into project.json, then rewrite project.md from it.
  const project = resolveComedyText(storyboard, config);
  writeFileSync(projectPath, `${JSON.stringify(project, null, 2)}\n`);
  writeFileSync(projectMdPath, formatProjectMd(project, {title: basename(root)}));

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

/** Which layers `syncProjectFiles` should refresh. */
export type SyncTarget = 'all' | 'transcript' | 'project';
/** Combined results from syncing one or more targets. */
export interface SyncResults {
  transcript?: ReturnType<typeof syncTranscript>;
  project?: SyncProjectResult;
}

/**
 * Sync selected markdown/JSON layers (transcript and/or project).
 * @param start Directory to search upward for `yumoframe.config.json` (default: cwd).
 * @param targets Layers to sync (`transcript`, `project`, and/or `all`).
 * @param options Options forwarded to `syncProject` (e.g. `align`).
 * @returns Partial results for the targets that ran.
 */
export function syncProjectFiles(
  start = process.cwd(),
  targets: SyncTarget[] = ['transcript', 'project'],
  options: {align?: boolean} = {},
): SyncResults {
  const results: SyncResults = {};
  // `all` is an alias that expands to both layers.
  if (targets.includes('transcript') || targets.includes('all')) {
    results.transcript = syncTranscript(start);
  }
  if (targets.includes('project') || targets.includes('all')) {
    results.project = syncProject(start, options);
  }
  return results;
}
