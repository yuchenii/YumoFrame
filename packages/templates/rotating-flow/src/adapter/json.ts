/** Strict parsers for rotating-flow authoring and resolved project documents. */
import type { LinesDocument, RotatingFlowProject, Storyboard, TextLine } from "./types.ts";

type JsonRecord = Record<string, unknown>;
const isRecord = (value: unknown): value is JsonRecord =>
  typeof value === "object" && value !== null && !Array.isArray(value);
const isNumber = (value: unknown): value is number =>
  typeof value === "number" && Number.isFinite(value);

function record(value: unknown, label: string): JsonRecord {
  if (!isRecord(value)) throw new Error(`${label} must be an object`);
  return value;
}

function stringField(value: JsonRecord, key: string, label: string): string {
  if (typeof value[key] !== "string") throw new Error(`${label}.${key} must be a string`);
  return value[key];
}

function optionalString(value: JsonRecord, key: string, label: string): void {
  if (value[key] !== undefined && typeof value[key] !== "string")
    throw new Error(`${label}.${key} must be a string`);
}

function numberField(value: JsonRecord, key: string, label: string): number {
  if (!isNumber(value[key])) throw new Error(`${label}.${key} must be a number`);
  return value[key];
}

function optionalNumber(value: JsonRecord, key: string, label: string): void {
  if (value[key] !== undefined && !isNumber(value[key]))
    throw new Error(`${label}.${key} must be a number`);
}

function line(value: unknown, label: string): TextLine {
  const item = record(value, label);
  if (item.start !== undefined && !isNumber(item.start))
    throw new Error(`${label}.start must be a number`);
  if (item.end !== undefined && !isNumber(item.end))
    throw new Error(`${label}.end must be a number`);
  optionalNumber(item, "fontSize", label);
  optionalNumber(item, "fontWeight", label);
  if (!Array.isArray(item.segments) || item.segments.length === 0)
    throw new Error(`${label}.segments must be a non-empty array`);
  for (const [index, rawSegment] of item.segments.entries()) {
    const segment = record(rawSegment, `${label}.segments[${index}]`);
    stringField(segment, "text", `${label}.segments[${index}]`);
    if (typeof segment.highlight !== "boolean")
      throw new Error(`${label}.segments[${index}].highlight must be boolean`);
  }
  return item as unknown as TextLine;
}

function parsed(text: string, label: string): unknown {
  try {
    return JSON.parse(text) as unknown;
  } catch (error) {
    throw new Error(`${label}: ${error instanceof Error ? error.message : String(error)}`);
  }
}

export function parseLinesDocument(text: string, label = "lines.json"): LinesDocument {
  const value = record(parsed(text, label), label);
  stringField(value, "template", label);
  optionalString(value, "version", label);
  if (!Array.isArray(value.lines)) throw new Error(`${label}.lines must be an array`);
  value.lines.forEach((item, index) => line(item, `${label}.lines[${index}]`));
  return value as unknown as LinesDocument;
}

export function parseStoryboard(text: string, label = "storyboard.json"): Storyboard {
  const value = record(parsed(text, label), label);
  stringField(value, "template", label);
  optionalString(value, "version", label);
  optionalNumber(value, "duration", label);
  if (value.endOverview !== undefined && typeof value.endOverview !== "boolean")
    throw new Error(`${label}.endOverview must be boolean`);
  if (value.source !== undefined) record(value.source, `${label}.source`);
  if (value.theme !== undefined) record(value.theme, `${label}.theme`);
  if (value.audio !== undefined) {
    const audio = record(value.audio, `${label}.audio`);
    stringField(audio, "src", `${label}.audio`);
    optionalString(audio, "source", `${label}.audio`);
  }
  if (!Array.isArray(value.scenes)) throw new Error(`${label}.scenes must be an array`);
  for (const [sceneIndex, rawScene] of value.scenes.entries()) {
    const scene = record(rawScene, `${label}.scenes[${sceneIndex}]`);
    if (!Array.isArray(scene.lines))
      throw new Error(`${label}.scenes[${sceneIndex}].lines must be an array`);
    scene.lines.forEach((item, lineIndex) =>
      line(item, `${label}.scenes[${sceneIndex}].lines[${lineIndex}]`),
    );
  }
  return value as unknown as Storyboard;
}

export function parseProject(text: string, label = "project.json"): RotatingFlowProject {
  const value = record(parsed(text, label), label);
  stringField(value, "version", label);
  stringField(value, "template", label);
  if (value.endOverview !== undefined && typeof value.endOverview !== "boolean")
    throw new Error(`${label}.endOverview must be boolean`);
  const composition = record(value.composition, `${label}.composition`);
  for (const key of ["width", "height", "fps", "duration"])
    numberField(composition, key, `${label}.composition`);
  stringField(composition, "background", `${label}.composition`);
  record(value.source, `${label}.source`);
  record(value.theme, `${label}.theme`);
  const timeline = record(value.timeline, `${label}.timeline`);
  const virtualCanvas = record(timeline.virtualCanvas, `${label}.timeline.virtualCanvas`);
  numberField(virtualCanvas, "width", `${label}.timeline.virtualCanvas`);
  numberField(virtualCanvas, "height", `${label}.timeline.virtualCanvas`);
  if (!Array.isArray(timeline.scenes)) throw new Error(`${label}.timeline.scenes must be an array`);
  for (const [sceneIndex, rawScene] of timeline.scenes.entries()) {
    const sceneLabel = `${label}.timeline.scenes[${sceneIndex}]`;
    const scene = record(rawScene, sceneLabel);
    stringField(scene, "id", sceneLabel);
    numberField(scene, "start", sceneLabel);
    numberField(scene, "end", sceneLabel);
    const camera = record(scene.camera, `${sceneLabel}.camera`);
    for (const key of ["targetX", "targetY", "scale", "rotate"])
      numberField(camera, key, `${sceneLabel}.camera`);
    stringField(camera, "ease", `${sceneLabel}.camera`);
    if (!Array.isArray(scene.elements)) throw new Error(`${sceneLabel}.elements must be an array`);
    for (const [elementIndex, rawElement] of scene.elements.entries()) {
      const elementLabel = `${sceneLabel}.elements[${elementIndex}]`;
      const element = record(rawElement, elementLabel);
      for (const key of ["id", "type", "align", "enter"]) stringField(element, key, elementLabel);
      optionalString(element, "exit", elementLabel);
      for (const key of ["x", "y", "width", "rotate", "scale", "fontSize", "lineHeight"])
        numberField(element, key, elementLabel);
      if (!Array.isArray(element.lines)) throw new Error(`${elementLabel}.lines must be an array`);
      for (const [lineIndex, rawLine] of element.lines.entries()) {
        const resolvedLine = line(rawLine, `${elementLabel}.lines[${lineIndex}]`);
        if (!isNumber(resolvedLine.start) || !isNumber(resolvedLine.end))
          throw new Error(`${elementLabel}.lines[${lineIndex}] needs numeric start/end`);
      }
    }
  }
  if (value.audio !== undefined) {
    const audio = record(value.audio, `${label}.audio`);
    for (const key of ["voice", "bgm"]) {
      if (audio[key] === undefined) continue;
      const track = record(audio[key], `${label}.audio.${key}`);
      stringField(track, "src", `${label}.audio.${key}`);
      optionalNumber(track, "start", `${label}.audio.${key}`);
      optionalNumber(track, "volume", `${label}.audio.${key}`);
      optionalString(track, "source", `${label}.audio.${key}`);
    }
  }
  return value as unknown as RotatingFlowProject;
}
