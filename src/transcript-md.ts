/**
 * Human-readable transcript Markdown: format, parse, and merge corrections into ASR JSON.
 */
import type {Transcript, TranscriptSegment} from './types.js';

/** One segment as recovered from `transcript.md` (original + cleaned text with clocks). */
export interface ParsedTranscriptSegment {
  start: number;
  end: number;
  original: string;
  cleaned: string;
}

function padTime(seconds: number): string {
  return Number(seconds).toFixed(2).padStart(7, '0');
}

/**
 * Format ASR transcript JSON as reviewable Markdown with 原文 / 校对 fields.
 * @param transcript - Machine transcript document.
 * @returns Newline-terminated Markdown.
 */
export function formatTranscriptMd(transcript: Transcript): string {
  const lines = [
    '# transcript',
    '',
    '> 对照改「校对」。留空表示丢弃该段。改完后运行 `yumoframe sync transcript`。',
    '',
  ];
  for (const [index, segment] of (transcript.segments ?? []).entries()) {
    // Unset cleaned → show ASR text as the starting 校对 value.
    const cleaned = segment.cleaned === undefined ? segment.text : segment.cleaned;
    lines.push(`## [${padTime(segment.start)}-${padTime(segment.end)}]`);
    lines.push(`- 原文：${segment.text ?? ''}`);
    lines.push(`- 校对：${cleaned ?? ''}`);
    lines.push('');
  }
  return `${lines.join('\n').trimEnd()}\n`;
}

/**
 * Parse `transcript.md` section headings and 原文/校对 bullets.
 * @param markdown - Full transcript.md contents.
 * @returns Segments in document order.
 */
export function parseTranscriptMd(markdown: string): ParsedTranscriptSegment[] {
  const segments: ParsedTranscriptSegment[] = [];
  let current: ParsedTranscriptSegment | null = null;

  for (const raw of markdown.split(/\r?\n/)) {
    const line = raw.trimEnd();
    const heading = line.match(/^##\s+\[(\d+(?:\.\d+)?)-(\d+(?:\.\d+)?)\]/);
    if (heading) {
      current = {start: Number(heading[1]), end: Number(heading[2]), original: '', cleaned: ''};
      segments.push(current);
      continue;
    }
    if (!current) continue;
    const original = line.match(/^-+\s*原文：\s*(.*)$/);
    if (original) {
      current.original = original[1];
      continue;
    }
    const cleaned = line.match(/^-+\s*校对：\s*(.*)$/);
    if (cleaned) {
      current.cleaned = cleaned[1];
    }
  }

  if (segments.length === 0) throw new Error('transcript.md has no ## [start-end] sections');
  return segments;
}

/**
 * Apply md edits onto existing transcript.json (keeps timestamps / engine fields).
 * Segment count and clocks must match the JSON; only `cleaned` is updated.
 * @param transcript - Existing ASR transcript.
 * @param parsedSegments - Output of {@link parseTranscriptMd}.
 * @returns Updated transcript document.
 */
export function applyTranscriptMd(transcript: Transcript, parsedSegments: ParsedTranscriptSegment[]): Transcript {
  const existing = transcript.segments ?? [];
  // Structure must match JSON so ASR timestamps / engine fields stay attached.
  if (parsedSegments.length !== existing.length) {
    throw new Error(`transcript.md has ${parsedSegments.length} segments but json has ${existing.length}`);
  }

  const segments = existing.map((segment, index) => {
    const edited = parsedSegments[index];
    if (!edited) throw new Error(`transcript.md missing segment ${index}`);
    // ~1 frame tolerance for padded toFixed(2) round-trips.
    if (Math.abs(edited.start - segment.start) > 0.051 || Math.abs(edited.end - segment.end) > 0.051) {
      throw new Error(`segment ${index} time mismatch: md [${edited.start}-${edited.end}] vs json [${segment.start}-${segment.end}]`);
    }
    return {
      ...segment,
      text: segment.text,
      // Empty cleaned is intentional (drop on align); still write the field back.
      cleaned: edited.cleaned,
    };
  });

  return {...transcript, segments};
}

/**
 * Segments used for align / downstream: non-empty cleaned, else original text.
 * Empty cleaned values drop the segment entirely.
 * @param transcript - Transcript with optional `cleaned` fields.
 * @returns Segments whose `text` is the effective review string.
 */
export function effectiveTranscriptSegments(transcript: Transcript): TranscriptSegment[] {
  return (transcript.segments ?? [])
    .map((segment) => {
      // Missing cleaned → use ASR text; present-but-empty → drop segment.
      const hasCleaned = Object.hasOwn(segment, 'cleaned');
      const cleaned = hasCleaned ? segment.cleaned : segment.text;
      if (hasCleaned && String(cleaned).trim() === '') return null;
      return {
        ...segment,
        text: String(cleaned ?? segment.text ?? ''),
      };
    })
    .filter((segment): segment is TranscriptSegment => segment !== null);
}
