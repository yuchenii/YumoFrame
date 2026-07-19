/** Framework-level sync helpers for transcript Markdown and JSON. */
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { loadConfig } from "../core/config.ts";
import { parseTranscript } from "../core/json.ts";
import {
  applyTranscriptMd,
  formatTranscriptMd,
  parseTranscriptMd,
} from "../media/transcript-md.ts";
import type { YumoFrameConfig } from "../core/types.ts";

function pathOr(config: YumoFrameConfig, key: string, fallback: string): string {
  return config.paths?.[key] || fallback;
}

/** Apply transcript.md edits onto transcript.json and rewrite both files. */
export function syncTranscript(start = process.cwd()): {
  transcriptPath: string;
  transcriptMdPath: string;
  segments: number;
} {
  const { root, config } = loadConfig(start);
  const transcriptPath = resolve(root, pathOr(config, "transcript", "transcript.json"));
  const transcriptMdPath = resolve(root, pathOr(config, "transcriptMd", "transcript.md"));
  if (!existsSync(transcriptPath)) throw new Error(`Missing ${transcriptPath}`);
  if (!existsSync(transcriptMdPath)) throw new Error(`Missing ${transcriptMdPath}`);

  const transcript = parseTranscript(readFileSync(transcriptPath, "utf8"), transcriptPath);
  const next = applyTranscriptMd(
    transcript,
    parseTranscriptMd(readFileSync(transcriptMdPath, "utf8")),
  );
  writeFileSync(transcriptPath, `${JSON.stringify(next, null, 2)}\n`);
  writeFileSync(transcriptMdPath, formatTranscriptMd(next));
  return { transcriptPath, transcriptMdPath, segments: next.segments.length };
}

/** Export transcript.json to transcript.md without applying prior Markdown edits. */
export function exportTranscriptMd(start = process.cwd()): { transcriptMdPath: string } {
  const { root, config } = loadConfig(start);
  const transcriptPath = resolve(root, pathOr(config, "transcript", "transcript.json"));
  const transcriptMdPath = resolve(root, pathOr(config, "transcriptMd", "transcript.md"));
  if (!existsSync(transcriptPath)) throw new Error(`Missing ${transcriptPath}`);
  const transcript = parseTranscript(readFileSync(transcriptPath, "utf8"), transcriptPath);
  writeFileSync(transcriptMdPath, formatTranscriptMd(transcript));
  return { transcriptMdPath };
}
