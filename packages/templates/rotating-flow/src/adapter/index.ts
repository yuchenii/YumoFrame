/** Rotating-flow authoring rules, validation, and project resolution. */
import { existsSync } from "node:fs";
import { relative, resolve } from "node:path";
import type { YumoFrameConfig } from "@yumoframe/cli/core/types";
import { layoutRotatingFlowProject, DEFAULT_MAX_LINE_FONT_SIZE } from "./layout.ts";
import type { LinesDocument, RotatingFlowProject, Storyboard, TextLine } from "./types.ts";
import { DEFAULT_FONT_FAMILY } from "../layout-constants.ts";

export const ROTATING_FLOW_TEMPLATE = "rotating-flow";
const isRotatingFlowTemplate = (value: unknown): boolean => value === ROTATING_FLOW_TEMPLATE;

/** Maximum display units allowed on a single kinetic-text line. */
export const MAX_LINE_UNITS = 8;
/** Maximum lines allowed inside one scene. */
export const MAX_LINES_PER_SCENE = 4;
const SHORT_LINE_UNITS = 2;
const MAX_SHORT_LINE_RATIO = 0.25;
const MIN_AVG_LINES_PER_SCENE = 2.5;
const OVERVIEW_PAD = 1.5;
const PUNCT_RE = /[，。！？、；：""''“”‘’（）()[\]【】《》〈〉…—\-~～,.!?;:'"`]/gu;
const hasPunctuation = (text: string) =>
  /[，。！？、；：""''“”‘’（）()[\]【】《》〈〉…—\-~～,.!?;:'"` ]/.test(text) || /\s/.test(text);
const DEFAULT_THEME = {
  fontFamily: DEFAULT_FONT_FAMILY,
  textColor: "#FFFFFF",
  highlightColor: "#65F2A3",
  cursorColor: "#FFFFFF",
  dimCursorColor: "#7A7A7A",
};

/**
 * Measure display width: CJK/other = 1, ASCII [\x00-\xff] = 0.5.
 * Keep in sync with runtime template scripts/line-units.mjs.
 * @param text - Line or segment text to measure.
 * @returns Weighted unit count.
 */
export function lineUnits(text: unknown): number {
  // Half-width ASCII counts as 0.5 so Latin and CJK share one visual budget.
  return [...String(text ?? "")].reduce(
    (sum, char) => sum + (/[^\x00-\xff]/.test(char) ? 1 : 0.5),
    0,
  );
}

const lineText = (line: TextLine) => (line.segments ?? []).map((segment) => segment.text).join("");
const round = (number: number) => Math.round(number * 100) / 100;
const formatUnits = (value: number) => (Math.round(value * 10) / 10).toFixed(1);

/**
 * Remove punctuation and whitespace from authored text (kinetic lines must be bare words).
 * @param text - Raw segment or line text.
 * @returns Stripped string (may be empty).
 */
export function stripPunctuation(text: unknown): string {
  return String(text ?? "")
    .replace(PUNCT_RE, "")
    .replace(/\s+/g, "");
}

/**
 * Flatten scene-nested lines into a single ordered list.
 * @param scenes - Storyboard scenes (default empty).
 * @returns Concatenated lines in scene order.
 */
export function flattenScenes(scenes: Storyboard["scenes"] = []): TextLine[] {
  return (scenes ?? []).flatMap((scene) => scene.lines ?? []);
}

/** Strip punctuation from each segment and drop empty lines. */
function sanitizeLineList(lines: TextLine[] = []): TextLine[] {
  const next: TextLine[] = [];
  for (const line of lines ?? []) {
    const segments = [];
    for (const segment of line.segments ?? []) {
      const text = stripPunctuation(segment.text);
      if (!text) continue;
      segments.push({ ...segment, text });
    }
    if (segments.length === 0) continue;
    next.push({ ...line, segments });
  }
  return next;
}

/**
 * Drop empty segments/lines/scenes after punctuation strip.
 * @param storyboard - Authored storyboard document.
 * @returns Sanitized copy with empty scenes removed.
 */
export function sanitizeStoryboard(storyboard: Storyboard): Storyboard {
  const scenes: Storyboard["scenes"] = [];
  for (const scene of storyboard.scenes ?? []) {
    const lines = sanitizeLineList(scene.lines);
    if (lines.length === 0) continue;
    scenes.push({ ...scene, lines });
  }
  return { ...storyboard, scenes };
}

/**
 * Sanitize a flat lines.json document the same way as storyboard lines.
 * @param doc - Intermediate lines document.
 * @returns Document with cleaned non-empty lines.
 */
export function sanitizeLinesDoc(doc: LinesDocument): LinesDocument {
  return { ...doc, lines: sanitizeLineList(doc.lines) };
}

/**
 * Shared line-list checks: timing order, punctuation, unit limits, short-line and highlight ratios.
 */
function validateLineList(
  lines: TextLine[],
  errors: string[],
  labelFor: (index: number) => string,
): void {
  let previousEnd = 0;
  let highlighted = 0;
  let total = 0;
  let shortLines = 0;
  const punctSamples = [];

  for (const [index, line] of lines.entries()) {
    const label = labelFor(index);
    const { start, end } = line;
    if (typeof start === "number" && typeof end === "number") {
      if (end <= start) errors.push(`${label} end must be after start (got ${start}–${end})`);
      if (start < previousEnd) {
        errors.push(
          `${label} starts at ${start} before previous line ended at ${previousEnd} — fix timing order, do not rewrite unrelated lines`,
        );
      }
      previousEnd = Math.max(previousEnd, end);
    }
    // Missing clocks OK before resolve auto-align from transcript; text-only must fill them before resolve.
    if (!Array.isArray(line.segments) || line.segments.length === 0) {
      errors.push(`${label}.segments must be a non-empty array`);
      continue;
    }
    for (const [segmentIndex, segment] of line.segments.entries()) {
      if (typeof segment.text !== "string" || segment.text.length === 0) {
        errors.push(`${label}.segments[${segmentIndex}].text must be non-empty`);
        continue;
      }
      if (typeof segment.highlight !== "boolean")
        errors.push(`${label}.segments[${segmentIndex}].highlight must be boolean`);
      if (hasPunctuation(segment.text)) {
        if (punctSamples.length < 8) punctSamples.push(`${label}: "${segment.text}"`);
      }
      const stripped = stripPunctuation(segment.text);
      const length = [...stripped].length;
      total += length;
      if (segment.highlight === true) highlighted += length;
    }
    const text = stripPunctuation(lineText(line));
    const size = lineUnits(text);
    if (!text) {
      errors.push(
        `${label} is empty after removing punctuation — delete the line or replace with real words`,
      );
      continue;
    }
    if (size <= SHORT_LINE_UNITS) shortLines += 1;
    if (size > MAX_LINE_UNITS) {
      errors.push(
        `${label} is ${formatUnits(size)} units (max ${MAX_LINE_UNITS}): "${text}" — re-break THIS line at a phrase boundary; do NOT merge other lines to compensate`,
      );
    }
  }

  if (punctSamples.length) {
    errors.push(
      `punctuation/spaces are not allowed in line text — remove them (e.g. 六百二 not 六百二。). Examples: ${punctSamples.join("; ")}`,
    );
  }

  // Only enforce short-line density on longer boards (short drafts stay flexible).
  if (lines.length >= 12) {
    const ratio = shortLines / lines.length;
    if (ratio > MAX_SHORT_LINE_RATIO) {
      errors.push(
        `too many tiny lines: ${shortLines}/${lines.length} (${Math.round(ratio * 100)}%) have ≤${SHORT_LINE_UNITS} units (max ${Math.round(MAX_SHORT_LINE_RATIO * 100)}%) — join related 1–2 character crumbs into phrases; one-char-per-line is invalid`,
      );
    }
  }

  // Highlight is per character after punctuation strip, not per segment.
  if (total > 0 && highlighted / total > 0.35) {
    const ratio = Math.round((highlighted / total) * 100);
    errors.push(
      `highlight ratio ${ratio}% exceeds 35% (${highlighted}/${total} chars) — un-highlight some tokens; prefer punch nouns/numbers only`,
    );
  }
}

/**
 * Validate intermediate lines.json (step 1 — breaks only).
 * @param doc - Flat lines authoring document.
 * @returns Human-readable error strings (empty when valid).
 */
export function validateLinesDoc(doc: LinesDocument): string[] {
  const errors: string[] = [];
  if (!isRotatingFlowTemplate(doc?.template)) errors.push("template must be rotating-flow");
  if (!Array.isArray(doc?.lines) || doc.lines.length === 0) {
    errors.push("lines must be a non-empty array");
    return errors;
  }
  validateLineList(doc.lines, errors, (index) => `lines[${index}]`);
  return errors;
}

/**
 * Validate storyboard scene tree structure and flattened line rules.
 * @param storyboard - Authored scenes[].lines document.
 * @returns Human-readable error strings (empty when valid).
 */
export function validateStoryboard(storyboard: Storyboard): string[] {
  const errors: string[] = [];
  if (!isRotatingFlowTemplate(storyboard?.template)) errors.push("template must be rotating-flow");
  if (!Array.isArray(storyboard?.scenes) || storyboard.scenes.length === 0) {
    errors.push(
      "scenes must be a non-empty array — author storyboard.json as scenes[].lines (not flat lines)",
    );
    return errors;
  }

  let lineCount = 0;
  for (const [sceneIndex, scene] of storyboard.scenes.entries()) {
    const sceneId = `scenes[${sceneIndex}]`;
    if (!Array.isArray(scene?.lines) || scene.lines.length === 0) {
      errors.push(`${sceneId} must have a non-empty lines array`);
      continue;
    }
    if (scene.lines.length > MAX_LINES_PER_SCENE) {
      errors.push(
        `${sceneId} has ${scene.lines.length} lines (max ${MAX_LINES_PER_SCENE}) — move overflow into a new scene; do NOT merge lines to fit`,
      );
    }
    lineCount += scene.lines.length;
  }

  // Fragmentation check only once there are enough scenes to judge pacing.
  const avg = lineCount / storyboard.scenes.length;
  if (storyboard.scenes.length >= 8 && avg < MIN_AVG_LINES_PER_SCENE) {
    errors.push(
      `scenes are too fragmented: ${storyboard.scenes.length} scenes, avg ${avg.toFixed(2)} lines/scene (prefer 3–4, min ${MIN_AVG_LINES_PER_SCENE}) — merge related beats into fewer scenes; do NOT use one tiny line per scene`,
    );
  }

  const flat = flattenScenes(storyboard.scenes);
  validateLineList(flat, errors, (index) => {
    let offset = 0;
    for (const [sceneIndex, scene] of storyboard.scenes.entries()) {
      const count = scene.lines?.length ?? 0;
      if (index < offset + count) return `scenes[${sceneIndex}].lines[${index - offset}]`;
      offset += count;
    }
    return `lines[${index}]`;
  });

  return errors;
}

/**
 * Compile a sanitized storyboard into a Remotion-ready project.json payload.
 * Requires line clocks; throws on blocking validation errors (punctuation warnings alone are non-blocking).
 * @param storyboard - Authored storyboard with timed lines.
 * @param config - Project config (render size / fps).
 * @returns Resolved rotating-flow project.
 */
export function resolveRotatingFlow(
  storyboard: Storyboard,
  config: YumoFrameConfig,
): RotatingFlowProject {
  const sanitized = sanitizeStoryboard(storyboard);
  const errors = validateStoryboard(sanitized);
  // Sanitizer already strips punctuation; treat those validate messages as non-blocking.
  const blocking = errors.filter((error) => !error.includes("punctuation/spaces are not allowed"));
  const flat = flattenScenes(sanitized.scenes);
  for (const [index, line] of flat.entries()) {
    if (typeof line.start !== "number" || typeof line.end !== "number") {
      blocking.push(
        `scenes line ${index} missing start/end — for media run resolve with transcript.json present (auto-align); for text-only author clocks`,
      );
    }
  }
  if (blocking.length) throw new Error(blocking.join("\n"));

  const { width = 1080, height = 1920, fps = 30 } = config.render ?? {};
  const lines = flattenScenes(sanitized.scenes);
  const lastEnd = lines.at(-1)?.end ?? 0;
  const endOverview = sanitized.endOverview !== false;
  // Pad past last line so Remotion can hold the end-overview (or a short tail).
  const duration =
    Math.ceil(
      (Math.max(lastEnd, sanitized.duration ?? lastEnd) + (endOverview ? OVERVIEW_PAD : 0.5)) * 10,
    ) / 10;

  const scenes = sanitized.scenes.map((scene, index) => {
    const sceneLines = scene.lines;
    return {
      id: `scene-${String(index + 1).padStart(3, "0")}`,
      start: round(sceneLines[0]?.start ?? 0),
      end: round(sceneLines.at(-1)?.end ?? 0),
      // Alternate 0 / -90 so consecutive scenes always differ by 90°.
      camera: {
        targetX: 0,
        targetY: 0,
        scale: 1,
        rotate: index % 2 === 0 ? 0 : -90,
        ease: "spring",
      },
      elements: [
        {
          id: `text-${String(index + 1).padStart(3, "0")}`,
          type: "kinetic-text",
          x: 0,
          y: 0,
          width: 0,
          rotate: 0,
          scale: 1,
          fontSize: DEFAULT_MAX_LINE_FONT_SIZE,
          lineHeight: 1.32,
          align: "right",
          enter: "typewriter-pop",
          exit: "fade-slide",
          lines: sceneLines.map((line) => ({
            segments: line.segments,
            start: round(line.start ?? 0),
            end: round(line.end ?? 0),
          })),
        },
      ],
    };
  });

  const project: RotatingFlowProject = {
    version: "0.1.0",
    template: ROTATING_FLOW_TEMPLATE,
    endOverview,
    composition: { width, height, fps, duration, background: "#000000" },
    source: sanitized.source ?? { type: "text", text: lines.map(lineText).join("") },
    theme: { ...DEFAULT_THEME, ...sanitized.theme },
    // Large virtual canvas: resolve places scenes far apart for camera pans.
    timeline: { virtualCanvas: { width: 40000, height: 40000 }, scenes },
  };
  if (sanitized.audio?.src)
    project.audio = {
      voice: {
        src: sanitized.audio.src,
        start: 0,
        volume: 1,
        source: sanitized.audio.source ?? "user",
      },
    };
  return layoutRotatingFlowProject(project);
}

/**
 * Validate a resolved project.json against rotating-flow rules and on-disk audio paths.
 * @param project - Resolved Remotion project payload.
 * @param projectRoot - Absolute project root for asset path checks.
 * @returns Human-readable error strings (empty when valid).
 */
export function validateProject(project: RotatingFlowProject, projectRoot: string): string[] {
  const errors: string[] = [];
  if (!isRotatingFlowTemplate(project?.template)) errors.push("template must be rotating-flow");
  if (!(project?.composition?.duration > 0)) errors.push("composition.duration must be positive");
  if (!Array.isArray(project?.timeline?.scenes)) errors.push("timeline.scenes must be an array");

  let previousSceneEnd = 0;
  let previousRotate = null;
  let lastLineEnd = 0;
  for (const scene of project?.timeline?.scenes ?? []) {
    if (!(scene.end > scene.start)) errors.push(`${scene.id} end must be after start`);
    if (scene.start < previousSceneEnd)
      errors.push(`${scene.id} starts before previous scene ended`);
    if (![0, -90, 90].includes(scene.camera?.rotate))
      errors.push(`${scene.id} camera.rotate must be 0, -90, or 90`);
    // Template invariant: each cut flips orientation by exactly 90°.
    if (previousRotate !== null && Math.abs(scene.camera.rotate - previousRotate) !== 90)
      errors.push(`${scene.id} must rotate 90 degrees from previous scene`);
    previousRotate = scene.camera?.rotate;
    previousSceneEnd = scene.end;
    for (const element of scene.elements ?? []) {
      const lineCount = element.lines?.length ?? 0;
      if (lineCount > MAX_LINES_PER_SCENE) {
        errors.push(
          `${scene.id} / ${element.id} has ${lineCount} lines (max ${MAX_LINES_PER_SCENE}) — move overflow into a new scene; do NOT merge lines to fit`,
        );
      }
      for (const [lineIndex, line] of (element.lines ?? []).entries()) {
        lastLineEnd = Math.max(lastLineEnd, line.end ?? 0);
        const text = (line.segments ?? []).map((segment) => segment.text).join("");
        const size = lineUnits(text);
        if (text && size > MAX_LINE_UNITS) {
          errors.push(
            `${scene.id} line ${lineIndex + 1} is ${formatUnits(size)} units (max ${MAX_LINE_UNITS}): "${text}" — re-break THIS line; do NOT merge neighbors`,
          );
        }
      }
    }
  }
  if (project?.timeline?.scenes?.length > 0 && !(project.composition.duration > lastLineEnd))
    errors.push("composition.duration must be greater than the last line end");

  const tracks: Array<[string, { src: string } | undefined]> = [
    ["audio.voice", project.audio?.voice],
    ["audio.bgm", project.audio?.bgm],
  ];
  for (const [label, track] of tracks) {
    if (!track?.src) continue;
    const path = resolve(projectRoot, track.src);
    const rel = relative(projectRoot, path);
    // Reject absolute paths and `..` escapes outside the project tree.
    if (rel.startsWith("..") || rel === "")
      errors.push(`${label}.src must stay inside project root`);
    else if (!existsSync(path)) errors.push(`${label}.src file missing: ${track.src}`);
  }
  return errors;
}

/**
 * Re-nest a flat aligned line list into the storyboard scene tree (same lengths).
 * @param storyboard - Original scene tree (structure only).
 * @param alignedLines - Flat lines with updated clocks, matching flatten order.
 * @returns Storyboard with lined clocks nested back into scenes.
 */
export function nestAlignedLines(storyboard: Storyboard, alignedLines: TextLine[]): Storyboard {
  // Flatten order must match alignStoryboardLines input; lengths are an invariant.
  const scenes: Storyboard["scenes"] = [];
  let offset = 0;
  for (const scene of storyboard.scenes ?? []) {
    const count = scene.lines.length;
    scenes.push({ ...scene, lines: alignedLines.slice(offset, offset + count) });
    offset += count;
  }
  if (offset !== alignedLines.length) {
    throw new Error(
      `aligned line count ${alignedLines.length} does not match storyboard lines ${offset}`,
    );
  }
  return { ...storyboard, scenes };
}
