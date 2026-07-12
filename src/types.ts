/**
 * Shared TypeScript shapes for authoring documents, ASR transcripts, and resolved Remotion projects.
 */

/** One highlightable span inside a kinetic-text line. */
export interface TextSegment {
  text: string;
  highlight: boolean;
}

/** A timed (or pre-align) kinetic-text line made of segments. */
export interface TextLine {
  /** Seconds on the media timeline; optional until resolve/align fills them. */
  start?: number;
  /** Seconds on the media timeline; must be after `start` when both are set. */
  end?: number;
  segments: TextSegment[];
  fontSize?: number;
  fontWeight?: number;
}

/** Intermediate flat `lines.json` document (breaks only, before scenes). */
export interface LinesDocument {
  version?: string;
  template: string;
  lines: TextLine[];
}

/** One authored scene: a short list of lines shown together. */
export interface StoryboardScene {
  lines: TextLine[];
}

/** Authored `storyboard.json`: scene tree plus optional theme/audio/source. */
export interface Storyboard {
  version?: string;
  template: string;
  /** Optional authored duration override (seconds); resolve pads past last line when unset. */
  duration?: number;
  /** When not false, resolve adds an end-overview hold after the last line. */
  endOverview?: boolean;
  source?: Record<string, unknown>;
  theme?: Record<string, unknown>;
  audio?: {src: string; source?: string};
  scenes: StoryboardScene[];
}

/** One ASR utterance with optional human-cleaned text and per-char timestamps. */
export interface TranscriptSegment {
  start: number;
  end: number;
  text: string;
  /** Human correction; empty string means drop this segment from align. */
  cleaned?: string;
  /** FunASR per-char clocks as `[startMs, endMs]` pairs (milliseconds). */
  timestamp?: number[][];
  [key: string]: unknown;
}

/** Machine `transcript.json` document produced by ASR. */
export interface Transcript {
  segments: TranscriptSegment[];
  [key: string]: unknown;
}

/** Camera transform for a resolved scene on the virtual canvas. */
export interface Camera {
  targetX: number;
  targetY: number;
  scale: number;
  /** Degrees; comedy-text expects 0 / ±90 between adjacent scenes. */
  rotate: number;
  ease: string;
}

/** Resolved kinetic-text element placed in a scene. */
export interface ResolvedTextElement {
  id: string;
  type: string;
  x: number;
  y: number;
  width: number;
  rotate: number;
  scale: number;
  fontSize: number;
  lineHeight: number;
  align: string;
  enter: string;
  exit?: string;
  lines: TextLine[];
}

/** One resolved timeline scene with camera and elements. */
export interface ResolvedScene {
  id: string;
  start: number;
  end: number;
  camera: Camera;
  elements: ResolvedTextElement[];
}

/** Fully resolved `project.json` consumed by the Remotion template. */
export interface YumoFrameProject {
  version: string;
  template: string;
  endOverview?: boolean;
  composition: {width: number; height: number; fps: number; duration: number; background: string};
  source: Record<string, unknown>;
  theme: Record<string, unknown>;
  /** `virtualCanvas` is oversized so scenes can be laid out far apart for camera moves. */
  timeline: {virtualCanvas: {width: number; height: number}; scenes: ResolvedScene[]};
  audio?: {
    voice?: {src: string; start: number; volume: number; source: string};
    bgm?: {src: string; start?: number; volume?: number; source?: string};
  };
}

/** Project-root `yumoframe.config.json` settings. */
export interface YumoFrameConfig {
  version: string;
  runtimeVersion: string;
  template: string;
  /** `runtime` = packaged template; `local` = ejected copy under `templatePath`. */
  templateSource: 'runtime' | 'local';
  templatePath: string | null;
  paths: Record<string, string> & {
    media: string;
    voice: string;
    transcript: string;
    project: string;
    output: string;
  };
  render: {composition: string; width?: number; height?: number; fps?: number};
  processors: {
    asr: {
      type: 'builtin' | 'command';
      name?: string;
      runner?: string;
      command?: string[];
      env?: NodeJS.ProcessEnv;
      options?: {device?: string; hotwords?: string; maxSegmentMs?: number};
    };
  };
}
