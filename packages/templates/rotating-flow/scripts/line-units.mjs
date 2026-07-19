#!/usr/bin/env node
/**
 * Count visual units for rotating-flow lines.
 * MUST match src/adapter/index.ts `lineUnits` + `stripPunctuation`.
 *
 * Usage:
 *   node line-units.mjs '校长知道我要'
 *   node line-units.mjs --check '超过六个汉字啦'
 *   node line-units.mjs --file /path/to/lines.json
 *
 * --check: exit 1 if a single line is > 6 units
 * --file: check every line in lines.json; exit 1 if any > 6 or empty after strip
 */

import { readFileSync } from "node:fs";

const MAX_LINE_UNITS = 6;
const PUNCT_RE = /[，。！？、；：""''“”‘’（）()[\]【】《》〈〉…—\-~～,.!?;:'"`]/gu;

/** Remove punctuation and whitespace before measuring units. */
function stripPunctuation(text) {
  return String(text ?? "")
    .replace(PUNCT_RE, "")
    .replace(/\s+/g, "");
}

/** CJK/other = 1, ASCII [\x00-\xff] = 0.5 */
function lineUnits(text) {
  // Must stay in sync with src/adapter/index.ts `lineUnits`.
  return [...String(text ?? "")].reduce(
    (sum, char) => sum + (/[^\x00-\xff]/.test(char) ? 1 : 0.5),
    0,
  );
}

/** Join segment texts from a line-like object. */
function textFromSegments(segments) {
  return (segments ?? []).map((segment) => segment.text ?? "").join("");
}

/**
 * Parse CLI text, a JSON line object, or a segments array into plain text.
 * @param {string} raw - Raw argv fragment
 */
function lineTextFromArg(raw) {
  const trimmed = String(raw ?? "").trim();
  if (trimmed.startsWith("{") || trimmed.startsWith("[")) {
    const parsed = JSON.parse(trimmed);
    if (Array.isArray(parsed)) return textFromSegments(parsed);
    if (parsed.segments) return textFromSegments(parsed.segments);
    if (typeof parsed.text === "string") return parsed.text;
  }
  return trimmed;
}

/** Format units to one decimal for stable CLI output. */
function formatUnits(value) {
  return String(Math.round(value * 10) / 10);
}

/**
 * Measure one line; optionally enforce the max-units rule.
 * @param {string} raw - Line text or JSON
 * @param {{check: boolean, label?: string}} options
 * @returns {number} Exit code contribution (0 or 1)
 */
function checkOne(raw, { check, label = "line" }) {
  const text = stripPunctuation(lineTextFromArg(raw));
  const units = lineUnits(text);
  if (!check) {
    console.log(formatUnits(units));
    return 0;
  }
  if (!text) {
    console.error(`fail: ${label} empty after stripping punctuation`);
    return 1;
  }
  // Soft cap: punchlines stay ≤6 visual units per line.
  if (units > MAX_LINE_UNITS) {
    console.error(`fail: ${label} ${formatUnits(units)} units > ${MAX_LINE_UNITS} for "${text}"`);
    return 1;
  }
  console.log(`${label}\t${formatUnits(units)}\t${text}`);
  return 0;
}

/**
 * Validate every line in a lines.json document (units + optional tiny-line ratio).
 * @param {string} path - Path to lines.json
 * @returns {number} Process exit code (0 or 1)
 */
function checkFile(path) {
  const doc = JSON.parse(readFileSync(path, "utf8"));
  if (!Array.isArray(doc.lines) || doc.lines.length === 0) {
    console.error("fail: lines.json must have a non-empty lines array");
    return 1;
  }
  let failed = 0;
  let short = 0;
  for (const [index, line] of doc.lines.entries()) {
    const text = stripPunctuation(textFromSegments(line.segments));
    const units = lineUnits(text);
    const label = `lines[${index}]`;
    if (!text) {
      console.error(`fail: ${label} empty after stripping punctuation`);
      failed = 1;
      continue;
    }
    if (units > MAX_LINE_UNITS) {
      console.error(`fail: ${label} ${formatUnits(units)} units > ${MAX_LINE_UNITS} for "${text}"`);
      failed = 1;
      continue;
    }
    if (units <= 2) short += 1;
    console.log(`${label}\t${formatUnits(units)}\t${text}`);
  }
  // Long scripts: >25% of lines ≤2 units looks too choppy.
  if (doc.lines.length >= 12) {
    const ratio = short / doc.lines.length;
    if (ratio > 0.25) {
      console.error(
        `fail: too many tiny lines: ${short}/${doc.lines.length} (${Math.round(ratio * 100)}%) ≤2 units (max 25%)`,
      );
      failed = 1;
    }
  }
  if (!failed) console.error(`ok: ${doc.lines.length} lines`);
  return failed;
}

/**
 * CLI entry: `--file`, `--check`, or print units for a single argument.
 * @param {string[]} argv - Args after node/script
 */
function main(argv) {
  const check = argv.includes("--check");
  const fileIdx = argv.indexOf("--file");
  if (fileIdx !== -1) {
    const path = argv[fileIdx + 1];
    if (!path) {
      console.error("Usage: node line-units.mjs --file <lines.json>");
      process.exit(2);
    }
    process.exit(checkFile(path));
  }

  const args = argv.filter((arg) => arg !== "--check");
  if (args.length === 0) {
    console.error("Usage: node line-units.mjs [--check] <text|json-line>");
    console.error("       node line-units.mjs --file <lines.json>");
    process.exit(2);
  }
  process.exit(checkOne(args.join(" "), { check }));
}

main(process.argv.slice(2));
