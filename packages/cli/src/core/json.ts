/** Strict parsers for framework-owned config and transcript documents. */
import { readFileSync } from "node:fs";
import type { Transcript, YumoFrameConfig } from "./types.ts";

/** Read a JSON file without validating its shape. */
export function readJsonFile(path: string): unknown {
  return JSON.parse(readFileSync(path, "utf8")) as unknown;
}

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

function optionalNumber(value: JsonRecord, key: string, label: string): void {
  if (value[key] !== undefined && !isNumber(value[key]))
    throw new Error(`${label}.${key} must be a number`);
}

function parsed(text: string, label: string): unknown {
  try {
    return JSON.parse(text) as unknown;
  } catch (error) {
    throw new Error(`${label}: ${error instanceof Error ? error.message : String(error)}`);
  }
}

function processorEnv(spec: JsonRecord, label: string): void {
  if (spec.env === undefined) return;
  const env = record(spec.env, `${label}.env`);
  for (const [key, envValue] of Object.entries(env)) {
    if (typeof envValue !== "string" && envValue !== undefined)
      throw new Error(`${label}.env.${key} must be a string`);
  }
}

function processor(value: unknown, label: string): void {
  const spec = record(value, label);
  const runner = stringField(spec, "runner", label);
  if (!["uv", "command", "api"].includes(runner))
    throw new Error(`${label}.runner must be uv, command, or api`);
  optionalString(spec, "profile", label);
  processorEnv(spec, label);
  if (runner === "uv") {
    stringField(spec, "name", label);
    optionalString(spec, "uvBin", label);
    if (spec.options !== undefined) record(spec.options, `${label}.options`);
  } else if (runner === "command") {
    if (
      !Array.isArray(spec.command) ||
      spec.command.length === 0 ||
      !spec.command.every((item) => typeof item === "string")
    ) {
      throw new Error(`${label}.command must be a non-empty string array`);
    }
  } else {
    stringField(spec, "provider", label);
    for (const key of ["baseUrl", "model", "voice", "apiKeyEnv"]) optionalString(spec, key, label);
    if (spec.options !== undefined) record(spec.options, `${label}.options`);
  }
}

export function parseConfig(text: string, label = "yumoframe.config.json"): YumoFrameConfig {
  const value = record(parsed(text, label), label);
  for (const key of ["version", "runtimeVersion", "template", "templateSource"])
    stringField(value, key, label);
  optionalString(value, "preset", label);
  if (!["runtime", "local"].includes(String(value.templateSource)))
    throw new Error(`${label}.templateSource must be runtime or local`);
  if (value.templatePath !== null && typeof value.templatePath !== "string")
    throw new Error(`${label}.templatePath must be a string or null`);
  if (value.templateSource === "local" && typeof value.templatePath !== "string")
    throw new Error(`${label}.templatePath is required for local templates`);
  const paths = record(value.paths, `${label}.paths`);
  for (const [key, path] of Object.entries(paths)) {
    if (typeof path !== "string") throw new Error(`${label}.paths.${key} must be a string`);
  }
  for (const key of ["media", "voice", "transcript", "project", "output"])
    stringField(paths, key, `${label}.paths`);
  const render = record(value.render, `${label}.render`);
  stringField(render, "composition", `${label}.render`);
  for (const key of ["width", "height", "fps"]) optionalNumber(render, key, `${label}.render`);
  const processors = record(value.processors, `${label}.processors`);
  processor(processors.asr, `${label}.processors.asr`);
  if (processors.tts !== undefined) processor(processors.tts, `${label}.processors.tts`);
  if (processors.align !== undefined) processor(processors.align, `${label}.processors.align`);
  return value as unknown as YumoFrameConfig;
}

export function parseTranscript(text: string, label = "transcript.json"): Transcript {
  const value = record(parsed(text, label), label);
  if (!Array.isArray(value.segments)) throw new Error(`${label}.segments must be an array`);
  for (const [index, rawSegment] of value.segments.entries()) {
    const segment = record(rawSegment, `${label}.segments[${index}]`);
    if (!isNumber(segment.start) || !isNumber(segment.end))
      throw new Error(`${label}.segments[${index}] needs numeric start/end`);
    stringField(segment, "text", `${label}.segments[${index}]`);
    optionalString(segment, "cleaned", `${label}.segments[${index}]`);
    if (segment.timestamp !== undefined) {
      if (
        !Array.isArray(segment.timestamp) ||
        !segment.timestamp.every(
          (pair) => Array.isArray(pair) && pair.length >= 2 && pair.every(isNumber),
        )
      ) {
        throw new Error(`${label}.segments[${index}].timestamp must contain numeric pairs`);
      }
    }
  }
  return value as unknown as Transcript;
}
