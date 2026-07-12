/**
 * Shared project, scene, and kinetic-text types for the comedy-text Remotion template.
 */

/** Camera easing used for scene-to-scene transitions. */
export type CameraEase = 'spring' | 'linear';

/** Origin of the voice track (user recording or TTS). */
export type AudioSourceKind = 'user' | 'tts';

/** Narration / dialogue audio clip. */
export type VoiceTrack = {
  src: string;
  start?: number;
  volume?: number;
  source?: AudioSourceKind | string;
};

/** Background music track. */
export type BgmTrack = {
  src: string;
  start?: number;
  volume?: number;
  loop?: boolean;
};

/** One-shot sound effect cue on the timeline. */
export type SfxCue = {
  id: string;
  src: string;
  at: number;
  volume?: number;
};

/** Optional audio bundle attached to a project. */
export type ProjectAudio = {
  voice?: VoiceTrack;
  bgm?: BgmTrack;
  sfx?: SfxCue[];
};

/** Full comedy-text project document consumed by Remotion compositions. */
export type YumoFrameProject = {
  version: string;
  template: string;
  endOverview?: boolean;
  composition: {
    width: number;
    height: number;
    fps: number;
    duration: number;
    background: string;
  };
  source: {
    type: string;
    text: string;
  };
  theme: {
    fontFamily: string;
    textColor: string;
    highlightColor: string;
    cursorColor: string;
    dimCursorColor: string;
  };
  audio?: ProjectAudio;
  timeline: {
    virtualCanvas: {
      width: number;
      height: number;
    };
    scenes: Scene[];
  };
};

/** One timed camera beat with kinetic-text elements. */
export type Scene = {
  id: string;
  start: number;
  end: number;
  camera: Camera;
  elements: KineticTextElement[];
};

/** Camera framing for a scene (target, zoom, rotation, ease). */
export type Camera = {
  targetX: number;
  targetY: number;
  scale: number;
  rotate: number;
  ease: CameraEase | string;
  pivotX?: number;
  pivotY?: number;
};

/** Contiguous run of characters sharing highlight state. */
export type TextSegment = {
  text: string;
  highlight: boolean;
};

/** Timed line within a kinetic-text element. */
export type TextLine = {
  segments: TextSegment[];
  start: number;
  end: number;
  /** Absolute px; omit → light auto from character units × element fontSize */
  fontSize?: number;
  /** CSS weight; omit → 900 */
  fontWeight?: number;
};

/** Positioned kinetic-text block on the virtual canvas. */
export type KineticTextElement = {
  id: string;
  type: 'kinetic-text';
  x: number;
  y: number;
  width: number;
  rotate: number;
  scale: number;
  fontSize: number;
  lineHeight: number;
  align?: 'left' | 'center' | 'right' | string;
  enter?: string;
  exit?: string;
  lines: TextLine[];
};

/** Per-character reveal timing derived from a text line. */
export type LineChar = {
  char: string;
  highlight: boolean;
  /** Absolute seconds when this glyph becomes visible. */
  start: number;
  lineIndex: number;
  charIndex: number;
};
