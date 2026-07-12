/**
 * Bidirectional conversion between resolved projects / storyboards and human-editable `project.md`.
 */
import type {Storyboard, StoryboardScene, TextLine, TextSegment, YumoFrameProject} from './types.js';

/** Result of parsing `project.md` into an authoring scene tree. */
export interface ParsedProjectMd {
  scenes: StoryboardScene[];
  sceneCount: number;
  lineCount: number;
}

const lineText = (line: TextLine) => (line.segments ?? []).map((segment) => segment.text).join('');

/**
 * Serialize segments to Markdown, wrapping highlighted spans in `**...**`.
 * @param segments - Kinetic-text segments.
 * @returns Inline Markdown for one bullet line.
 */
export function segmentsToMarkdown(segments: TextSegment[]): string {
  return (segments ?? [])
    .map((segment) => (segment.highlight ? `**${segment.text}**` : segment.text))
    .join('');
}

/**
 * Parse inline Markdown highlights (`**text**`) back into segment objects.
 * @param text - One project.md bullet body.
 * @returns Non-empty segment list (throws if empty).
 */
export function markdownToSegments(text: string): TextSegment[] {
  const segments: TextSegment[] = [];
  // Non-greedy so adjacent **a****b** highlights split correctly.
  const pattern = /\*\*(.+?)\*\*/g;
  let last = 0;
  let match;
  while ((match = pattern.exec(text))) {
    if (match.index > last) {
      const plain = text.slice(last, match.index);
      if (plain) segments.push({text: plain, highlight: false});
    }
    segments.push({text: match[1] ?? '', highlight: true});
    last = match.index + match[0].length;
  }
  if (last < text.length) {
    const plain = text.slice(last);
    if (plain) segments.push({text: plain, highlight: false});
  }
  if (segments.length === 0) throw new Error(`Empty project.md line: ${text}`);
  return segments;
}

function formatClock(seconds: number): string {
  return Number(seconds).toFixed(2);
}

/**
 * Render a resolved project as reviewable Markdown (scene headings + bullet lines).
 * @param project - Resolved Remotion project.
 * @param options.title - Document H1 title (default `"project"`).
 * @returns Newline-terminated Markdown.
 */
export function formatProjectMd(project: YumoFrameProject, {title = 'project'}: {title?: string} = {}): string {
  const lines = [`# ${title}`, ''];

  for (const scene of project.timeline?.scenes ?? []) {
    const rotate = scene.camera?.rotate ?? 0;
    lines.push(`## ${scene.id}  ${formatClock(scene.start)}–${formatClock(scene.end)}  rotate:${rotate}`);
    for (const element of scene.elements ?? []) {
      for (const line of element.lines ?? []) {
        lines.push(`- ${segmentsToMarkdown(line.segments)}`);
      }
    }
    lines.push('');
  }
  return `${lines.join('\n').trimEnd()}\n`;
}

/**
 * Parse `project.md` scene headings and bullets into an authoring scene tree.
 * Clocks/rotate on headings are ignored for sync; only text/highlights are recovered.
 * @param markdown - Full project.md contents.
 * @returns Parsed scenes plus counts.
 */
export function parseProjectMd(markdown: string): ParsedProjectMd {
  const scenes: Array<{id: string; lines: TextLine[]}> = [];
  let current: {id: string; lines: TextLine[]} | null = null;

  for (const raw of markdown.split(/\r?\n/)) {
    const line = raw.trimEnd();
    // Heading clocks/rotate are display-only; sync rebuilds timing from transcript/align.
    const heading = line.match(/^##\s+(\S+)(?:\s+(\d+(?:\.\d+)?)[–-](\d+(?:\.\d+)?))?(?:\s+rotate:(-?\d+))?/);
    if (heading) {
      current = {id: heading[1] ?? '', lines: []};
      scenes.push(current);
      continue;
    }
    const bullet = line.match(/^-+\s+(.*)$/);
    if (bullet) {
      if (!current) throw new Error('project.md line appears before any ## scene heading');
      current.lines.push({segments: markdownToSegments(bullet[1].trim())});
    }
  }

  if (scenes.length === 0) throw new Error('project.md has no ## scene sections');
  if (scenes.some((scene) => scene.lines.length === 0)) throw new Error('project.md has an empty scene');
  // Mirrors MAX_LINES_PER_SCENE in comedy-text.
  if (scenes.some((scene) => scene.lines.length > 4)) throw new Error('project.md scene exceeds 4 lines');

  return {
    // Drop heading ids; storyboard scenes are positional only.
    scenes: scenes.map((scene) => ({lines: scene.lines})),
    sceneCount: scenes.length,
    lineCount: scenes.reduce((sum, scene) => sum + scene.lines.length, 0),
  };
}

/**
 * Recover an in-memory authoring storyboard from a resolved project.
 * @param project - Resolved Remotion project.json payload.
 * @returns Storyboard shaped for authoring / re-resolve.
 */
export function storyboardFromProject(project: YumoFrameProject): Storyboard {
  const scenes: StoryboardScene[] = [];
  for (const scene of project?.timeline?.scenes ?? []) {
    // Comedy-text resolves one kinetic-text element per scene.
    const sceneLines = scene.elements?.[0]?.lines ?? [];
    if (sceneLines.length === 0) continue;
    scenes.push({
      lines: sceneLines.map((line) => ({
        segments: line.segments,
        start: line.start,
        end: line.end,
        ...(line.fontSize != null ? {fontSize: line.fontSize} : {}),
        ...(line.fontWeight != null ? {fontWeight: line.fontWeight} : {}),
      })),
    });
  }
  const voice = project?.audio?.voice;
  return {
    version: project?.version || '0.1.0',
    template: project?.template || 'comedy-text',
    // Default on when omitted so round-trips keep the end hold.
    endOverview: project?.endOverview !== false,
    scenes,
    source: project?.source,
    theme: project?.theme,
    ...(voice?.src ? {audio: {src: voice.src, source: voice.source ?? 'user'}} : {}),
  };
}

/**
 * Build authoring storyboard from parsed project.md (+ optional extras like audio).
 * @param parsed - Output of {@link parseProjectMd}.
 * @param extras - Fields merged onto the storyboard (theme, audio, etc.).
 * @returns Storyboard ready for resolve.
 */
export function storyboardFromParsedMd(
  parsed: ParsedProjectMd,
  extras: Partial<Omit<Storyboard, 'scenes'>> = {},
): Storyboard {
  return {
    version: '0.1.0',
    template: 'comedy-text',
    scenes: parsed.scenes,
    ...extras,
  };
}

/**
 * Compare two lines by concatenated segment text only (ignores clocks).
 * @returns True when both lines render the same plain text.
 */
export function lineTextsEqual(a: TextLine, b: TextLine): boolean {
  return lineText(a) === lineText(b);
}
