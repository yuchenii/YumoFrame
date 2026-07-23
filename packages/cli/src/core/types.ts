/** Shared framework, transcript, processor, and project-configuration types. */

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
  pace: "slow" | "normal" | "fast";
  note?: string;
}

export type SpeechControl =
  | { type: "none" }
  | { type: "qwen-instruct"; instruct: string }
  | { type: "qwen-voice-design"; instruct: string }
  | { type: "indextts2-emo-text"; emoText: string; emoAlpha: number }
  | { type: "indextts2-emo-vector"; emoVector: number[] }
  | { type: "indextts2-emo-audio"; emoAudio: string; emoAlpha: number }
  | { type: "edge-prosody"; rate: string; pitch: string; volume: string }
  | { type: "dashscope-instruct"; instructions: string }
  | { type: "openai-speech"; instructions: string; speed: number };

export interface SpeechPlanSegment {
  id: string;
  text: string;
  intent: SpeechIntent;
  control: SpeechControl;
  pauseAfterMs: number;
}

/** Authored delivery plan; mandatory in the rotating-flow Skill, optional for direct CLI use. */
export interface SpeechPlan {
  version: "0.1.0";
  source: string;
  voice?: { description: string };
  segments: SpeechPlanSegment[];
}

export type TtsExecutionMode = "native-batch" | "persistent-loop" | "sequential" | "single";
export type ApiProtocol = "openai-compatible" | "dashscope-qwen-http" | "dashscope-cosyvoice-http";

export interface TtsProfile {
  id: string;
  execution: TtsExecutionMode;
  controls: SpeechControl["type"][];
  requiredConfig?: string[];
  requiredWholeTextConfig?: string[];
  configPaths?: string[];
  requiredPlan?: string[];
  controlOptions?: Record<
    string,
    {
      required: string[];
      constraints?: Record<string, unknown>;
      example: Record<string, unknown>;
    }
  >;
  timing: "native" | "align";
}

export interface TtsCapabilities {
  selected: {
    runner: Processor["runner"];
    provider?: string;
    processor?: string;
    model?: string;
    profile: string;
    protocol?: ApiProtocol;
    language?: string;
    speaker?: string;
    voice?: string;
    device?: string;
    modelSource?: string;
  };
  available?: {
    models: {
      runner: Processor["runner"];
      provider?: string;
      processor?: string;
      model: string;
      profile: string;
      protocol?: ApiProtocol;
      sources?: { provider: "modelscope" | "huggingface"; model: string }[];
    }[];
    voices?: { speaker: string; description: string; nativeLanguage: string }[];
  };
  profile: TtsProfile;
}

/** Local Python processor run once via uv; venv cached by (name, runtimeVersion). */
export interface UvProcessor {
  runner: "uv";
  /** Bundled sub-project under `processors/<name>`; also the venv cache key. */
  name: string;
  uvBin?: string;
  profile?: string;
  env?: NodeJS.ProcessEnv;
  options?: Record<string, string | number>;
}

/** Arbitrary external executable. `{text}`/`{out}` placeholders are substituted for TTS. */
export interface CommandProcessor {
  runner: "command";
  command: string[];
  profile?: string;
  env?: NodeJS.ProcessEnv;
}

/** Online HTTP TTS via a known native provider or OpenAI-compatible endpoint. */
export interface ApiProcessor {
  runner: "api";
  /** `openai` | `dashscope` | custom; selects the default baseUrl. */
  provider: string;
  /** Stable wire protocol; optional only for models in the built-in catalog. */
  protocol?: ApiProtocol;
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
  preset?: string;
  /** `runtime` = packaged template; `local` = ejected copy under `templatePath`. */
  templateSource: "runtime" | "local";
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
