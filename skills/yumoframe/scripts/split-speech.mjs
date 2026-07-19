#!/usr/bin/env node
/** Split source text into immutable delivery units without changing any characters. */
import { readFileSync } from "node:fs";

const input = process.argv[2];
if (!input) {
  console.error("Usage: node split-speech.mjs <text-file>");
  process.exit(2);
}

const source = readFileSync(input, "utf8");
if (!source.trim()) {
  console.error(`${input} is empty`);
  process.exit(1);
}

const hardEnd = new Set([
  "。",
  "！",
  "？",
  "!",
  "?",
  "；",
  ";",
  "，",
  ",",
  "：",
  ":",
  "—",
  "…",
  "\n",
]);
const closers = new Set(['"', "'", "”", "’", "）", ")", "】", "]", "》", "〉"]);
const units = [];
let start = 0;
let index = 0;

while (index < source.length) {
  const char = source[index];
  const periodEnd =
    char === "." &&
    (index + 1 === source.length ||
      /\s/.test(source[index + 1] ?? "") ||
      closers.has(source[index + 1] ?? ""));
  if (!hardEnd.has(char) && !periodEnd) {
    index += 1;
    continue;
  }
  index += 1;
  while (index < source.length && (hardEnd.has(source[index]) || closers.has(source[index])))
    index += 1;
  while (index < source.length && /\s/.test(source[index] ?? "")) index += 1;
  units.push(source.slice(start, index));
  start = index;
}
if (start < source.length) units.push(source.slice(start));

console.log(
  JSON.stringify(
    { source: input, units: units.map((text, i) => ({ id: `u${i + 1}`, text })) },
    null,
    2,
  ),
);
