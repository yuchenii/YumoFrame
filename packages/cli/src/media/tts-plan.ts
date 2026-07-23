/** Speech-plan parsing and TTS capability resolution shared by CLI runtime and the authoring Skill. */
import { existsSync, readFileSync } from "node:fs";
import { isAbsolute, resolve } from "node:path";
import { PACKAGE_ROOT } from "../core/package-root.ts";
import type {
  ApiProtocol,
  Processor,
  SpeechControl,
  SpeechPlan,
  SpeechPlanSegment,
  TtsCapabilities,
  TtsProfile,
} from "../core/types.ts";

type JsonRecord = Record<string, unknown>;
type RegisteredProfile = TtsProfile & {
  compatibleRunners?: Processor["runner"][];
  compatibleProtocols?: ApiProtocol[];
  match?: { runner?: string; name?: string; provider?: string | string[]; modelSuffix?: string };
};
type RegisteredModel = {
  runner: Processor["runner"];
  processor?: string;
  provider?: string;
  protocol?: ApiProtocol;
  model: string;
  profile: string;
  sources?: { provider: "modelscope" | "huggingface"; model: string }[];
};
type RegisteredVoice = NonNullable<NonNullable<TtsCapabilities["available"]>["voices"]>[number] & {
  runner: Processor["runner"];
  processor?: string;
  provider?: string | string[];
};
type TtsRegistry = {
  profiles: RegisteredProfile[];
  models: RegisteredModel[];
  voices: RegisteredVoice[];
};

const registryPath = resolve(PACKAGE_ROOT, "processors", "tts-profiles.json");
const API_PROTOCOLS = new Set<ApiProtocol>([
  "openai-compatible",
  "dashscope-qwen-http",
  "dashscope-cosyvoice-http",
]);
const isRecord = (value: unknown): value is JsonRecord =>
  typeof value === "object" && value !== null && !Array.isArray(value);
const finite = (value: unknown): value is number =>
  typeof value === "number" && Number.isFinite(value);

function object(value: unknown, label: string): JsonRecord {
  if (!isRecord(value)) throw new Error(`${label} must be an object`);
  return value;
}

function exactKeys(value: JsonRecord, label: string, allowed: string[]): void {
  const unexpected = Object.keys(value).filter((key) => !allowed.includes(key));
  if (unexpected.length > 0)
    throw new Error(
      `${label} has unsupported field${unexpected.length === 1 ? "" : "s"}: ${unexpected.join(", ")}`,
    );
}

function string(value: JsonRecord, key: string, label: string): string {
  const result = value[key];
  if (typeof result !== "string" || result.length === 0)
    throw new Error(`${label}.${key} must be a non-empty string`);
  return result;
}

function numberIn(value: JsonRecord, key: string, label: string, min: number, max: number): number {
  const result = value[key];
  if (!finite(result) || result < min || result > max)
    throw new Error(`${label}.${key} must be between ${min} and ${max}`);
  return result;
}

function parseControl(value: unknown, label: string): SpeechControl {
  const control = object(value, label);
  const type = string(control, "type", label);
  if (type === "none") {
    exactKeys(control, label, ["type"]);
    return { type };
  }
  if (type === "qwen-instruct" || type === "qwen-voice-design") {
    exactKeys(control, label, ["type", "instruct"]);
    return { type, instruct: string(control, "instruct", label) };
  }
  if (type === "indextts2-emo-text") {
    exactKeys(control, label, ["type", "emoText", "emoAlpha"]);
    return {
      type,
      emoText: string(control, "emoText", label),
      emoAlpha: numberIn(control, "emoAlpha", label, 0, 1),
    };
  }
  if (type === "indextts2-emo-vector") {
    exactKeys(control, label, ["type", "emoVector"]);
    const vector = control.emoVector;
    if (
      !Array.isArray(vector) ||
      vector.length !== 8 ||
      !vector.every((item) => finite(item) && item >= 0 && item <= 0.8)
    ) {
      throw new Error(`${label}.emoVector must contain exactly 8 numbers between 0 and 0.8`);
    }
    return { type, emoVector: vector };
  }
  if (type === "indextts2-emo-audio") {
    exactKeys(control, label, ["type", "emoAudio", "emoAlpha"]);
    return {
      type,
      emoAudio: string(control, "emoAudio", label),
      emoAlpha: numberIn(control, "emoAlpha", label, 0, 1),
    };
  }
  if (type === "edge-prosody") {
    exactKeys(control, label, ["type", "rate", "pitch", "volume"]);
    const rate = string(control, "rate", label);
    const pitch = string(control, "pitch", label);
    const volume = string(control, "volume", label);
    if (!/^[+-]\d+%$/.test(rate)) throw new Error(`${label}.rate must look like +10% or -10%`);
    if (!/^[+-]\d+Hz$/.test(pitch)) throw new Error(`${label}.pitch must look like +5Hz or -5Hz`);
    if (!/^[+-]\d+%$/.test(volume)) throw new Error(`${label}.volume must look like +10% or -10%`);
    return { type, rate, pitch, volume };
  }
  if (type === "openai-speech") {
    exactKeys(control, label, ["type", "instructions", "speed"]);
    return {
      type,
      instructions: string(control, "instructions", label),
      speed: numberIn(control, "speed", label, 0.25, 4),
    };
  }
  if (type === "dashscope-instruct") {
    exactKeys(control, label, ["type", "instructions"]);
    return { type, instructions: string(control, "instructions", label) };
  }
  throw new Error(`${label}.type '${type}' is not supported`);
}

/** Parse and validate the model-independent shape of `speech.json`. */
export function parseSpeechPlan(text: string, label = "speech.json"): SpeechPlan {
  let raw: unknown;
  try {
    raw = JSON.parse(text) as unknown;
  } catch (error) {
    throw new Error(`${label}: ${error instanceof Error ? error.message : String(error)}`);
  }
  const value = object(raw, label);
  exactKeys(value, label, ["version", "source", "voice", "segments"]);
  if (value.version !== "0.1.0") throw new Error(`${label}.version must be 0.1.0`);
  const source = string(value, "source", label);
  let voice: SpeechPlan["voice"];
  if (value.voice !== undefined) {
    const voiceValue = object(value.voice, `${label}.voice`);
    exactKeys(voiceValue, `${label}.voice`, ["description"]);
    voice = { description: string(voiceValue, "description", `${label}.voice`) };
  }
  if (!Array.isArray(value.segments) || value.segments.length === 0)
    throw new Error(`${label}.segments must be a non-empty array`);

  const ids = new Set<string>();
  const segments: SpeechPlanSegment[] = value.segments.map((rawSegment, index) => {
    const segmentLabel = `${label}.segments[${index}]`;
    const segment = object(rawSegment, segmentLabel);
    exactKeys(segment, segmentLabel, ["id", "text", "intent", "control", "pauseAfterMs"]);
    const id = string(segment, "id", segmentLabel);
    if (ids.has(id)) throw new Error(`${segmentLabel}.id '${id}' is duplicated`);
    ids.add(id);
    const intentValue = object(segment.intent, `${segmentLabel}.intent`);
    exactKeys(intentValue, `${segmentLabel}.intent`, ["emotion", "intensity", "pace", "note"]);
    const emotion = string(intentValue, "emotion", `${segmentLabel}.intent`);
    const intensity = numberIn(intentValue, "intensity", `${segmentLabel}.intent`, 0, 1);
    const pace = string(intentValue, "pace", `${segmentLabel}.intent`);
    if (pace !== "slow" && pace !== "normal" && pace !== "fast")
      throw new Error(`${segmentLabel}.intent.pace must be slow, normal, or fast`);
    if (intentValue.note !== undefined && typeof intentValue.note !== "string")
      throw new Error(`${segmentLabel}.intent.note must be a string`);
    const pauseAfterMs = segment.pauseAfterMs;
    if (
      !Number.isInteger(pauseAfterMs) ||
      !finite(pauseAfterMs) ||
      pauseAfterMs < 0 ||
      pauseAfterMs > 10000
    ) {
      throw new Error(`${segmentLabel}.pauseAfterMs must be an integer between 0 and 10000`);
    }
    return {
      id,
      text: string(segment, "text", segmentLabel),
      intent: {
        emotion,
        intensity,
        pace,
        ...(intentValue.note === undefined ? {} : { note: intentValue.note }),
      },
      control: parseControl(segment.control, `${segmentLabel}.control`),
      pauseAfterMs,
    };
  });
  return { version: "0.1.0", source, ...(voice ? { voice } : {}), segments };
}

function registry(): TtsRegistry {
  const raw = object(JSON.parse(readFileSync(registryPath, "utf8")) as unknown, registryPath);
  if (!Array.isArray(raw.profiles)) throw new Error(`${registryPath}.profiles must be an array`);
  if (!Array.isArray(raw.models)) throw new Error(`${registryPath}.models must be an array`);
  if (!Array.isArray(raw.voices)) throw new Error(`${registryPath}.voices must be an array`);
  return raw as TtsRegistry;
}

function publicProfile(profile: RegisteredProfile): TtsProfile {
  return {
    id: profile.id,
    execution: profile.execution,
    controls: profile.controls,
    ...(profile.requiredConfig ? { requiredConfig: profile.requiredConfig } : {}),
    ...(profile.requiredWholeTextConfig
      ? { requiredWholeTextConfig: profile.requiredWholeTextConfig }
      : {}),
    ...(profile.configPaths ? { configPaths: profile.configPaths } : {}),
    ...(profile.requiredPlan ? { requiredPlan: profile.requiredPlan } : {}),
    ...(profile.controlOptions ? { controlOptions: profile.controlOptions } : {}),
    timing: profile.timing,
  };
}

function processorMatches(
  profile: RegisteredProfile,
  processor: Processor,
  checkModel: boolean,
): boolean {
  if (profile.compatibleRunners && !profile.compatibleRunners.includes(processor.runner))
    return false;
  if (!profile.match) return true;
  if (profile.match.runner && profile.match.runner !== processor.runner) return false;
  if (processor.runner === "uv" && profile.match.name && profile.match.name !== processor.name)
    return false;
  if (processor.runner === "api" && profile.match.provider) {
    const providers = Array.isArray(profile.match.provider)
      ? profile.match.provider
      : [profile.match.provider];
    if (!providers.includes(processor.provider)) return false;
  }
  if (!checkModel || !profile.match.modelSuffix) return true;
  const model =
    processor.runner === "uv"
      ? String(processor.options?.model ?? "")
      : processor.runner === "api"
        ? (processor.model ?? "")
        : "";
  return model.split(/[/\\]snapshots[/\\]/, 1)[0]!.endsWith(profile.match.modelSuffix);
}

function fallbackProfile(processor: Processor, registered: RegisteredProfile[]): TtsProfile {
  if (processor.profile) {
    const selected = registered.find((profile) => profile.id === processor.profile);
    if (!selected) throw new Error(`Unknown processors.tts.profile '${processor.profile}'`);
    if (!processorMatches(selected, processor, true)) {
      throw new Error(
        `TTS profile '${selected.id}' is not compatible with the configured ${processor.runner} processor`,
      );
    }
    return publicProfile(selected);
  }
  const selected = registered.find(
    (profile) => profile.match && processorMatches(profile, processor, true),
  );
  if (!selected) return { id: "unknown", execution: "single", controls: ["none"], timing: "align" };
  return publicProfile(selected);
}

function configuredModel(processor: Processor): string | undefined {
  if (processor.runner === "uv") return configuredString(processor.options?.model);
  if (processor.runner === "api") return configuredString(processor.model);
  return undefined;
}

function registeredModel(
  processor: Processor,
  models: RegisteredModel[],
): RegisteredModel | undefined {
  const model = configuredModel(processor);
  return model
    ? models.find((entry) => catalogMatches(entry, processor) && entry.model === model)
    : undefined;
}

function knownApiProtocol(value: string): value is ApiProtocol {
  return API_PROTOCOLS.has(value as ApiProtocol);
}

function registeredProfile(
  id: string,
  processor: Processor,
  profiles: RegisteredProfile[],
  protocol?: ApiProtocol,
): RegisteredProfile {
  const profile = profiles.find((entry) => entry.id === id);
  if (!profile) throw new Error(`Unknown processors.tts.profile '${id}'`);
  if (
    !processorMatches(profile, processor, false) ||
    (protocol && profile.compatibleProtocols && !profile.compatibleProtocols.includes(protocol))
  ) {
    throw new Error(
      `TTS profile '${id}' is not compatible with the configured ${processor.runner} processor`,
    );
  }
  return profile;
}

/** Resolve one configured processor to its executable profile and API wire protocol. */
export function resolveTtsSelection(processor: Processor): {
  profile: TtsProfile;
  protocol?: ApiProtocol;
} {
  const registered = registry();
  const model = registeredModel(processor, registered.models);
  if (model) {
    if (processor.profile && processor.profile !== model.profile) {
      throw new Error(
        `Model '${model.model}' requires profile '${model.profile}', not '${processor.profile}'`,
      );
    }
    if (processor.runner === "api" && processor.protocol && processor.protocol !== model.protocol) {
      throw new Error(
        `Model '${model.model}' requires protocol '${model.protocol}', not '${processor.protocol}'`,
      );
    }
    if (processor.runner === "api" && !model.protocol)
      throw new Error(`Built-in API model '${model.model}' has no protocol`);
    const profile = registeredProfile(
      model.profile,
      processor,
      registered.profiles,
      model.protocol,
    );
    return {
      profile: publicProfile(profile),
      ...(model.protocol ? { protocol: model.protocol } : {}),
    };
  }
  if (processor.runner === "api") {
    if (!processor.protocol || !processor.profile) {
      throw new Error(
        `Unknown API model '${processor.model ?? ""}' requires explicit processors.tts.protocol and processors.tts.profile`,
      );
    }
    if (!knownApiProtocol(processor.protocol)) {
      throw new Error(`Unknown processors.tts.protocol '${processor.protocol}'`);
    }
    const profile = registeredProfile(
      processor.profile,
      processor,
      registered.profiles,
      processor.protocol,
    );
    return { profile: publicProfile(profile), protocol: processor.protocol };
  }
  return { profile: fallbackProfile(processor, registered.profiles) };
}

/** Resolve the active processor/model to a packaged capability profile. */
export function resolveTtsProfile(processor: Processor): TtsProfile {
  return resolveTtsSelection(processor).profile;
}

/** Resolve the stable wire protocol used by an API model. */
export function resolveTtsProtocol(processor: Processor): ApiProtocol | undefined {
  return resolveTtsSelection(processor).protocol;
}

/** Return the configured download sources for a packaged model. */
export function resolveTtsModelSources(
  processor: Processor,
): { provider: "modelscope" | "huggingface"; model: string }[] {
  if (processor.runner !== "uv") return [];
  const model = configuredString(processor.options?.model);
  if (!model) return [];
  return (
    registry().models.find((entry) => catalogMatches(entry, processor) && entry.model === model)
      ?.sources ?? []
  );
}

function catalogMatches(entry: RegisteredModel | RegisteredVoice, processor: Processor): boolean {
  if (entry.runner !== processor.runner) return false;
  if (processor.runner === "uv") return entry.processor === processor.name;
  if (processor.runner === "api" && entry.provider) {
    return (Array.isArray(entry.provider) ? entry.provider : [entry.provider]).includes(
      processor.provider,
    );
  }
  return false;
}

function configuredString(value: unknown): string | undefined {
  return typeof value === "string" && value.length > 0 ? value : undefined;
}

/** Report safe configured values plus the packaged catalog without loading a TTS model. */
export function resolveTtsCapabilities(processor: Processor): TtsCapabilities {
  const registered = registry();
  const selection = resolveTtsSelection(processor);
  const profile = selection.profile;
  const options = processor.runner === "command" ? undefined : processor.options;
  const model =
    processor.runner === "uv"
      ? configuredString(options?.model)
      : processor.runner === "api"
        ? configuredString(processor.model)
        : undefined;
  const language = configuredString(options?.language ?? options?.languageType);
  const speaker = configuredString(options?.speaker);
  const device = configuredString(options?.device);
  const sources = resolveTtsModelSources(processor);
  const modelSource =
    configuredString(options?.modelSource) ??
    (sources.find(({ provider }) => provider === "modelscope") ?? sources[0])?.provider;
  const selected: TtsCapabilities["selected"] = {
    runner: processor.runner,
    ...(processor.runner === "uv" ? { processor: processor.name } : {}),
    ...(processor.runner === "api" ? { provider: processor.provider } : {}),
    ...(model ? { model } : {}),
    profile: profile.id,
    ...(selection.protocol ? { protocol: selection.protocol } : {}),
    ...(language ? { language } : {}),
    ...(processor.runner === "uv" && speaker ? { speaker } : {}),
    ...(processor.runner === "api" && configuredString(processor.voice)
      ? { voice: processor.voice }
      : {}),
    ...(device ? { device } : {}),
    ...(modelSource ? { modelSource } : {}),
  };
  const models = registered.models.map(
    ({ runner, processor, provider, protocol, model, profile: modelProfile, sources }) => ({
      runner,
      ...(processor ? { processor } : {}),
      ...(provider ? { provider } : {}),
      model,
      profile: modelProfile,
      ...(protocol ? { protocol } : {}),
      ...(sources ? { sources } : {}),
    }),
  );
  const voices = registered.voices
    .filter((entry) => catalogMatches(entry, processor))
    .map(({ speaker, description, nativeLanguage }) => ({ speaker, description, nativeLanguage }));
  return {
    selected,
    ...(models.length > 0
      ? { available: { models, ...(voices.length > 0 ? { voices } : {}) } }
      : {}),
    profile,
  };
}

const neutralIntent = (segment: SpeechPlanSegment): boolean =>
  segment.intent.emotion === "neutral" &&
  segment.intent.intensity === 0 &&
  segment.intent.pace === "normal" &&
  !segment.intent.note;

function valueAt(value: unknown, path: string): unknown {
  return path
    .split(".")
    .reduce<unknown>((current, key) => (isRecord(current) ? current[key] : undefined), value);
}

/** Validate source fidelity and model compatibility before any expensive work starts. */
export function validateSpeechPlan(
  plan: SpeechPlan,
  sourceText: string,
  profile: TtsProfile,
): void {
  const joined = plan.segments.map((segment) => segment.text).join("");
  if (joined !== sourceText)
    throw new Error(`speech.json segments do not exactly reproduce ${plan.source}`);
  if (profile.execution === "single" && plan.segments.length > 1) {
    throw new Error(
      `TTS profile '${profile.id}' supports only whole-text synthesis; use the direct CLI without --plan or choose a segmented profile`,
    );
  }
  for (const segment of plan.segments) {
    if (!profile.controls.includes(segment.control.type)) {
      throw new Error(
        `segment ${segment.id} uses ${segment.control.type}, but TTS profile '${profile.id}' accepts ${profile.controls.join(", ")}`,
      );
    }
    if (segment.control.type === "none" && !neutralIntent(segment)) {
      throw new Error(
        `segment ${segment.id} has non-neutral intent, but TTS profile '${profile.id}' has no delivery control`,
      );
    }
  }
  for (const path of profile.requiredPlan ?? []) {
    const value = valueAt(plan, path);
    if (typeof value !== "string" || !value.trim())
      throw new Error(`TTS profile '${profile.id}' requires non-empty speech.json ${path}`);
  }
}

/** Validate profile-specific global options and referenced local resources. */
export function validateTtsConfiguration(
  profile: TtsProfile,
  processor: Processor,
  root?: string,
  mode: "whole" | "plan" = "whole",
): void {
  const required = [
    ...(profile.requiredConfig ?? []),
    ...(mode === "whole" ? (profile.requiredWholeTextConfig ?? []) : []),
  ];
  for (const path of required) {
    const value = valueAt(processor, path);
    if (typeof value !== "string" || !value.trim()) {
      throw new Error(`TTS profile '${profile.id}' requires non-empty processors.tts.${path}`);
    }
  }
  for (const path of profile.configPaths ?? []) {
    const value = valueAt(processor, path);
    if (root && typeof value === "string" && !/^[a-z][a-z\d+.-]*:/i.test(value)) {
      const absolute = isAbsolute(value) ? value : resolve(root, value);
      if (!existsSync(absolute))
        throw new Error(
          `TTS profile '${profile.id}' cannot find processors.tts.${path}: ${absolute}`,
        );
    }
  }
}
