/** Template-owned rotating-flow authoring and render contracts. */
export interface TextSegment {
  text: string;
  highlight: boolean;
}

/** A timed, or not-yet-aligned, rotating-flow line. */
export interface TextLine {
  start?: number;
  end?: number;
  segments: TextSegment[];
  fontSize?: number;
  fontWeight?: number;
}

/** Optional flat authoring layer used before lines are grouped into scenes. */
export interface LinesDocument {
  version?: string;
  template: string;
  lines: TextLine[];
}

export interface StoryboardScene {
  lines: TextLine[];
}

/** Authored rotating-flow scene tree. */
export interface Storyboard {
  version?: string;
  template: string;
  duration?: number;
  endOverview?: boolean;
  source?: Record<string, unknown>;
  theme?: Record<string, unknown>;
  audio?: { src: string; source?: string };
  scenes: StoryboardScene[];
}

export interface Camera {
  targetX: number;
  targetY: number;
  scale: number;
  rotate: number;
  ease: string;
}

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

export interface ResolvedScene {
  id: string;
  start: number;
  end: number;
  camera: Camera;
  elements: ResolvedTextElement[];
}

/** Resolved render contract consumed by the rotating-flow Remotion template. */
export interface RotatingFlowProject {
  version: string;
  template: string;
  endOverview?: boolean;
  composition: { width: number; height: number; fps: number; duration: number; background: string };
  source: Record<string, unknown>;
  theme: Record<string, unknown>;
  timeline: { virtualCanvas: { width: number; height: number }; scenes: ResolvedScene[] };
  audio?: {
    voice?: { src: string; start: number; volume: number; source: string };
    bgm?: { src: string; start?: number; volume?: number; source?: string };
  };
}

/** Shared resolved project name used by existing command modules. */
export type YumoFrameProject = RotatingFlowProject;
