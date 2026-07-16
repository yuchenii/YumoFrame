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
  audio?: { src: string; source?: string };
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

/** Engine-neutral performance intent authored before model-specific controls. */
export interface SpeechIntent {
  emotion: string;
  intensity: number;
  pace: 'slow' | 'normal' | 'fast';
  note?: string;
}

export type SpeechControl =
  | {type: 'none'}
  | {type: 'qwen-instruct'; instruct: string}
  | {type: 'qwen-voice-design'; instruct: string}
  | {type: 'indextts2-emo-text'; emoText: string; emoAlpha: number}
  | {type: 'indextts2-emo-vector'; emoVector: number[]}
  | {type: 'indextts2-emo-audio'; emoAudio: string; emoAlpha: number}
  | {type: 'edge-prosody'; rate: string; pitch: string; volume: string}
  | {type: 'dashscope-instruct'; instructions: string}
  | {type: 'openai-speech'; instructions: string; speed: number};

export interface SpeechPlanSegment {
  id: string;
  text: string;
  intent: SpeechIntent;
  control: SpeechControl;
  pauseAfterMs: number;
}

/** Authored delivery plan; mandatory in the comedy-text Skill, optional for direct CLI use. */
export interface SpeechPlan {
  version: '0.1.0';
  source: string;
  voice?: {description: string};
  segments: SpeechPlanSegment[];
}

export type TtsExecutionMode = 'native-batch' | 'persistent-loop' | 'sequential' | 'single';

export interface TtsProfile {
  id: string;
  execution: TtsExecutionMode;
  controls: SpeechControl['type'][];
  requiredConfig?: string[];
  requiredWholeTextConfig?: string[];
  configPaths?: string[];
  requiredPlan?: string[];
  controlOptions?: Record<string, {
    required: string[];
    constraints?: Record<string, unknown>;
    example: Record<string, unknown>;
  }>;
  timing: 'native' | 'align';
}

export interface TtsCapabilities {
  selected: {
    runner: Processor['runner'];
    provider?: string;
    processor?: string;
    model?: string;
    profile: string;
    language?: string;
    speaker?: string;
    voice?: string;
    device?: string;
  };
  available?: {
    models: {model: string; profile: string}[];
    voices?: {speaker: string; description: string; nativeLanguage: string}[];
  };
  profile: TtsProfile;
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
  composition: { width: number; height: number; fps: number; duration: number; background: string };
  source: Record<string, unknown>;
  theme: Record<string, unknown>;
  /** `virtualCanvas` is oversized so scenes can be laid out far apart for camera moves. */
  timeline: { virtualCanvas: { width: number; height: number }; scenes: ResolvedScene[] };
  audio?: {
    voice?: { src: string; start: number; volume: number; source: string };
    bgm?: { src: string; start?: number; volume?: number; source?: string };
  };
}

/** Local Python processor run once via uv; venv cached by (name, runtimeVersion). */
export interface UvProcessor {
  runner: 'uv';
  /** Bundled sub-project under `runtime/processors/<name>`; also the venv cache key. */
  name: string;
  uvBin?: string;
  profile?: string;
  env?: NodeJS.ProcessEnv;
  options?: Record<string, string | number>;
}

/** Arbitrary external executable. `{text}`/`{out}` placeholders are substituted for TTS. */
export interface CommandProcessor {
  runner: 'command';
  command: string[];
  profile?: string;
  env?: NodeJS.ProcessEnv;
}

/** Online HTTP TTS via a known native provider or OpenAI-compatible endpoint. */
export interface ApiProcessor {
  runner: 'api';
  /** `openai` | `qwen3-tts` | `dashscope` | custom; selects the default baseUrl. */
  provider: string;
  profile?: string;
  baseUrl?: string;
  model?: string;
  voice?: string;
  /** Name of the env var holding the API key (key never lives in the config file). */
  apiKeyEnv?: string;
  options?: Record<string, unknown>;
}

/** A pluggable processor: local uv, external command, or online API. */
export type Processor = UvProcessor | CommandProcessor | ApiProcessor;

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
  render: { composition: string; width?: number; height?: number; fps?: number };
  processors: {
    asr: Processor;
    tts?: Processor;
    /** Forced aligner: (audio + known text) → transcript.json, for TTS without native timestamps. */
    align?: Processor;
  };
}
