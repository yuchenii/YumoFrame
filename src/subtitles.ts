/** Convert TTS-emitted subtitles (SRT or WebVTT) into a transcript.json document (tier-1 timing). */
import type {Transcript} from './types.js';

/** Parse a `HH:MM:SS,mmm` (SRT) or `HH:MM:SS.mmm` / `MM:SS.mmm` (VTT) timestamp into seconds. */
function timeToSeconds(stamp: string): number {
  const cleaned = stamp.trim().replace(',', '.'); // SRT uses a comma for the millisecond separator.
  if (!cleaned) throw new Error('Empty subtitle timestamp');
  const parts = cleaned.split(':').map(Number);
  if (parts.some((n) => !Number.isFinite(n))) throw new Error(`Bad subtitle timestamp: ${stamp}`);
  const [seconds = 0, minutes = 0, hours = 0] = parts.reverse();
  return hours * 3600 + minutes * 60 + seconds;
}

/**
 * Parse SRT/WebVTT cues into transcript segments (one segment per cue).
 * Per-char timestamps are left off; the aligner interpolates within each cue.
 * @param subtitles Raw SRT or WebVTT text (e.g. edge-tts `--write-subtitles`).
 * @returns Transcript with cue-level timed segments.
 */
export function subtitlesToTranscript(subtitles: string): Transcript {
  const segments: Transcript['segments'] = [];
  // Cues are blank-line separated; a cue has an optional index line, then `start --> end`, then text.
  for (const block of subtitles.replace(/\r/g, '').split(/\n{2,}/)) {
    const lines = block.split('\n').map((line) => line.trim()).filter(Boolean);
    const arrowIndex = lines.findIndex((line) => line.includes('-->'));
    if (arrowIndex === -1) continue;
    const [rawStart, rawEnd] = lines[arrowIndex]!.split('-->');
    const text = lines.slice(arrowIndex + 1).join('').trim();
    if (!text) continue;
    // End may carry cue settings (e.g. "align:start"); take the first token.
    segments.push({start: timeToSeconds(rawStart!), end: timeToSeconds(rawEnd!.trim().split(/\s+/)[0]!), text});
  }
  if (segments.length === 0) throw new Error('No cues found in subtitle file');
  return {segments};
}
