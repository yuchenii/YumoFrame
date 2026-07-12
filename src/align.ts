/**
 * Align storyboard line clocks to ASR transcript character timelines.
 * Builds per-character timing and matches authored text against the transcript.
 */
import type {TextLine, Transcript, TranscriptSegment} from './types.js';

const PUNCT = /[\s,，。.!！?？、；;：:""''（）()\[\]【】《》…—\-]/u;
const CN_DIGITS = '零一二三四五六七八九';

/** One character with start/end seconds on the transcript timeline. */
export interface TimelineChar {
  char: string;
  start: number;
  end: number;
}

/**
 * Format transcript segments as `[start-end] text` lines for human review.
 * @param transcript - ASR transcript with timed segments.
 * @returns Newline-terminated cleaned transcript text.
 */
export function formatTranscriptTxt(transcript: Transcript): string {
  return (transcript.segments ?? [])
    .map((segment) => `[${Number(segment.start).toFixed(2).padStart(7, '0')}-${Number(segment.end).toFixed(2).padStart(7, '0')}] ${segment.text}`)
    .join('\n') + '\n';
}

/**
 * Parse cleaned `[start-end] text` transcript lines into segments.
 * @param text - Cleaned transcript body (one segment per line).
 * @returns Parsed segments; empty bodies are skipped.
 */
export function parseCleanedTranscript(text: string): TranscriptSegment[] {
  const segments: TranscriptSegment[] = [];
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim();
    if (!line) continue;
    const match = line.match(/^\[(\d+(?:\.\d+)?)-(\d+(?:\.\d+)?)\]\s*(.*)$/);
    if (!match) throw new Error(`Bad cleaned transcript line: ${line}`);
    const body = match[3].trim();
    if (!body) continue;
    segments.push({start: Number(match[1]), end: Number(match[2]), text: body});
  }
  return segments;
}

/**
 * Expand a segment into per-character clocks from ASR timestamps or linear interpolation.
 */
function charTimesForSegment(segment: TranscriptSegment): TimelineChar[] {
  const chars = [...segment.text];
  const stamps = segment.timestamp ?? [];
  const out = [];
  for (let index = 0; index < chars.length; index += 1) {
    // FunASR timestamps are ms; reuse last stamp when ASR returned fewer pairs than chars.
    const pair = stamps[index] ?? stamps[stamps.length - 1];
    if (Array.isArray(pair) && pair.length >= 2) {
      out.push({char: chars[index], start: pair[0] / 1000, end: pair[1] / 1000});
    } else if (chars.length === 1) {
      out.push({char: chars[index], start: segment.start, end: segment.end});
    } else {
      // No usable stamps: split the segment window evenly across characters.
      const t0 = segment.start;
      const t1 = segment.end;
      const start = t0 + ((t1 - t0) * index) / chars.length;
      const end = t0 + ((t1 - t0) * (index + 1)) / chars.length;
      out.push({char: chars[index], start, end});
    }
  }
  return out;
}

/**
 * Prefer per-segment cleaned text with ASR clocks; skip empty cleaned.
 * @param transcript - Raw ASR transcript (provides timestamps).
 * @param cleanedSegments - Optional parallel cleaned segments; when set, text comes from cleaned.
 * @returns Flattened character timeline across all segments.
 */
export function buildCharTimeline(transcript: Transcript, cleanedSegments: TranscriptSegment[] | null = null): TimelineChar[] {
  const raw = transcript.segments ?? [];
  if (cleanedSegments?.length) {
    // Parallel cleaned list: human text + clocks, but keep ASR per-char stamps from raw.
    const timeline = [];
    const count = Math.max(raw.length, cleanedSegments.length);
    for (let index = 0; index < count; index += 1) {
      const cleaned = cleanedSegments[index];
      const source = raw[index] ?? cleaned;
      if (!cleaned?.text) continue;
      timeline.push(...charTimesForSegment({
        start: cleaned.start ?? source.start,
        end: cleaned.end ?? source.end,
        text: cleaned.text,
        timestamp: source.timestamp,
      }));
    }
    return timeline;
  }

  return raw.flatMap((segment) => {
    // Explicit empty `cleaned` means drop the segment; missing `cleaned` keeps ASR text.
    const hasCleaned = Object.hasOwn(segment, 'cleaned');
    if (hasCleaned && String(segment.cleaned ?? '').trim() === '') return [];
    const text = String(hasCleaned ? segment.cleaned : segment.text);
    return charTimesForSegment({...segment, text});
  });
}

/** True when the character should participate in alignment (not punctuation/whitespace). */
function significant(char: string): boolean {
  return !PUNCT.test(char);
}

/**
 * Normalize a character for fuzzy matching (Chinese digits → Arabic, ASCII lowercased).
 * @param char - Single character from authored text or transcript.
 * @returns Normalized form used as the alignment needle.
 */
export function normalizeAlignChar(char: string): string {
  // Map 零–九 onto ASCII digits so authored Arabic numerals match ASR Chinese digits.
  const digit = CN_DIGITS.indexOf(char);
  if (digit >= 0) return String(digit);
  return char.toLowerCase();
}

/**
 * Match needle against timeline allowing skips in the transcript (ASR extras / uncorrected wording).
 * @returns `[startIndex, endIndex]` in significantTimeline, or null.
 */
function matchWithSkips(
  significantTimeline: Array<TimelineChar & {norm: string}>,
  needle: string[],
  from: number,
  maxSkip = 12,
): [number, number] | null {
  if (needle.length === 0) return null;

  for (let start = from; start < significantTimeline.length; start += 1) {
    if (significantTimeline[start].norm !== needle[0]) continue;

    let at = start;
    let needleIndex = 0;
    while (needleIndex < needle.length && at < significantTimeline.length) {
      if (significantTimeline[at].norm === needle[needleIndex]) {
        needleIndex += 1;
        at += 1;
        continue;
      }
      // ASR often inserts extra chars; allow a bounded skip before giving up this start.
      let skipped = 0;
      let found = -1;
      for (let ahead = at + 1; ahead < significantTimeline.length && skipped < maxSkip; ahead += 1) {
        skipped += 1;
        if (significantTimeline[ahead].norm === needle[needleIndex]) {
          found = ahead;
          break;
        }
      }
      if (found < 0) break;
      at = found + 1;
      needleIndex += 1;
    }

    if (needleIndex === needle.length) return [start, at - 1];
  }
  return null;
}

/**
 * Assign start/end on each line from the transcript char timeline.
 * Misses fall back to estimated clocks and are reported as warnings.
 * @param lines - Authored storyboard lines (text only or with existing clocks).
 * @param timeline - Character timeline from {@link buildCharTimeline}.
 * @returns `{lines, warnings}` with aligned clocks.
 */
export function alignStoryboardLines(lines: TextLine[], timeline: TimelineChar[]): {lines: TextLine[]; warnings: string[]} {
  const warnings: string[] = [];
  if (!timeline.length) {
    warnings.push('transcript timeline is empty; keeping existing line times');
    return {lines, warnings};
  }

  const significantTimeline = timeline
    .filter((item) => significant(item.char))
    .map((item) => ({...item, norm: normalizeAlignChar(item.char)}));

  let cursor = 0;
  const aligned: TextLine[] = [];

  for (const [lineIndex, line] of lines.entries()) {
    const text = (line.segments ?? []).map((segment) => segment.text).join('');
    const needle = [...text].filter(significant).map(normalizeAlignChar);
    if (needle.length === 0) {
      warnings.push(`lines[${lineIndex}] has no alignable characters`);
      aligned.push(line);
      continue;
    }

    // Monotonic search: each line starts after the previous match's endIndex.
    let span = matchWithSkips(significantTimeline, needle, cursor);
    if (!span) {
      warnings.push(`lines[${lineIndex}] align miss: "${text}"`);
      // Estimate duration from char count so resolve still has a usable clock.
      const fallbackStart = aligned.at(-1)?.end ?? timeline[0]?.start ?? 0;
      const fallbackEnd = fallbackStart + Math.max(0.12, needle.length * 0.08);
      aligned.push({...line, start: round(fallbackStart), end: round(Math.max(fallbackEnd, fallbackStart + 0.05))});
      continue;
    }

    let [startIndex, endIndex] = span;
    let start = significantTimeline[startIndex].start;
    let end = significantTimeline[endIndex].end;
    const previousEnd = aligned.at(-1)?.end;
    if (previousEnd != null && start < previousEnd) {
      // Prefer a later match that doesn't overlap; otherwise clamp start to previousEnd.
      const again = matchWithSkips(significantTimeline, needle, startIndex + 1);
      if (again && significantTimeline[again[0]].start >= previousEnd) {
        [startIndex, endIndex] = again;
        start = significantTimeline[startIndex].start;
        end = significantTimeline[endIndex].end;
      } else {
        start = previousEnd;
        if (end <= start) end = start + Math.max(0.05, needle.length * 0.06);
        warnings.push(`lines[${lineIndex}] clamped after overlap: "${text}"`);
      }
    }
    // Invariant: every line must have a positive duration after rounding.
    if (end <= start) end = start + 0.05;
    aligned.push({...line, start: round(start), end: round(end)});
    cursor = endIndex + 1;
  }

  return {lines: aligned, warnings};
}

function round(number: number): number {
  return Math.round(number * 1000) / 1000;
}
