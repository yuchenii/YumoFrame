/** Shared runtime for pluggable processors: venv cache paths, spawning, and the API speech client. */
import {spawn} from 'node:child_process';
import {writeFileSync} from 'node:fs';
import {homedir, platform} from 'node:os';
import {resolve} from 'node:path';
import type {ApiProcessor} from './types.js';

/** Command, args, and env used to invoke a spawn-based processor. */
export interface ProcessInvocation {
  command: string;
  args: string[];
  env: NodeJS.ProcessEnv;
}

/** OS-specific cache root used for processor virtualenvs. */
export function cacheRoot(): string {
  if (platform() === 'win32') return process.env.LOCALAPPDATA || resolve(homedir(), 'AppData', 'Local');
  if (platform() === 'darwin') return resolve(homedir(), 'Library', 'Caches');
  return process.env.XDG_CACHE_HOME || resolve(homedir(), '.cache');
}

/**
 * Cached uv/venv directory for a bundled `uv` processor.
 * @param name Processor name (e.g. `funasr`); each engine gets its own venv.
 * @param runtimeVersion Config `runtimeVersion`; bumps get a fresh venv.
 */
export function processorEnvironmentDir(name: string, runtimeVersion: string): string {
  return resolve(cacheRoot(), 'yumoframe', 'venvs', name, runtimeVersion);
}

/** Spawn a command inheriting stdio; resolve on exit 0, reject otherwise. */
export function run(command: string, args: string[], env: NodeJS.ProcessEnv = process.env): Promise<void> {
  return new Promise<void>((resolvePromise, reject) => {
    const child = spawn(command, args, {env, stdio: 'inherit'});
    child.on('error', reject);
    child.on('exit', (code, signal) => {
      if (signal) reject(new Error(`${command} terminated by ${signal}`));
      else if (code !== 0) reject(new Error(`${command} exited with code ${code}`));
      else resolvePromise();
    });
  });
}

/** Substitute `{key}` placeholders (e.g. `{text}`, `{out}`) in an argv template. */
export function fillArgs(argv: string[], vars: Record<string, string>): string[] {
  return argv.map((arg) => arg.replace(/\{(\w+)\}/g, (match, key: string) => (key in vars ? vars[key]! : match)));
}

/** Forward a uv processor's `options` as `--kebab-key value` flags (e.g. maxSegmentMs → --max-segment-ms). */
export function optionFlags(options: Record<string, string | number> = {}): string[] {
  return Object.entries(options).flatMap(([key, value]) => [`--${key.replace(/[A-Z]/g, (c) => `-${c.toLowerCase()}`)}`, String(value)]);
}

/** Default API roots for known speech providers. */
const DEFAULT_BASE_URLS: Record<string, string> = {
  openai: 'https://api.openai.com/v1',
  'qwen3-tts': 'https://dashscope.aliyuncs.com/api/v1',
  dashscope: 'https://dashscope.aliyuncs.com/api/v1',
};

const DASHSCOPE_PROVIDERS = new Set(['dashscope', 'qwen3-tts']);
const DASHSCOPE_LANGUAGES = new Set(['Auto', 'Chinese', 'English', 'German', 'Italian', 'Portuguese', 'Spanish', 'Japanese', 'Korean', 'French', 'Russian']);

/** Build the native DashScope input body from the small supported option set. */
export function dashscopeSpeechBody(spec: ApiProcessor, io: {text: string; options?: Record<string, unknown>}): Record<string, unknown> {
  const options = {...spec.options, ...io.options};
  const languageType = options.languageType;
  const instructions = options.instructions;
  const optimizeInstructions = options.optimizeInstructions;
  if (languageType !== undefined && (typeof languageType !== 'string' || !DASHSCOPE_LANGUAGES.has(languageType))) {
    throw new Error(`processors.tts.options.languageType is not supported: ${String(languageType)}`);
  }
  if (instructions !== undefined && (typeof instructions !== 'string' || !instructions.trim())) {
    throw new Error('DashScope instructions must be a non-empty string');
  }
  if (optimizeInstructions !== undefined && typeof optimizeInstructions !== 'boolean') {
    throw new Error('processors.tts.options.optimizeInstructions must be boolean');
  }
  if (instructions !== undefined && !spec.model?.includes('qwen3-tts-instruct-flash')) {
    throw new Error(`DashScope model '${spec.model}' does not support instructions`);
  }
  if (optimizeInstructions === true && instructions === undefined) {
    throw new Error('DashScope optimizeInstructions requires instructions');
  }
  return {
    model: spec.model,
    input: {
      text: io.text,
      voice: spec.voice,
      ...(languageType === undefined ? {} : {language_type: languageType}),
      ...(instructions === undefined ? {} : {instructions}),
      ...(optimizeInstructions === undefined ? {} : {optimize_instructions: optimizeInstructions}),
    },
  };
}

/**
 * Synthesize speech via DashScope's native endpoint or an OpenAI-compatible endpoint.
 * @param spec API processor config (provider/baseUrl/model/voice/apiKeyEnv/options).
 * @param io Text to speak and the output audio path to write.
 */
export async function runApiSpeech(spec: ApiProcessor, io: {text: string; outPath: string; options?: Record<string, unknown>}): Promise<void> {
  const baseUrl = spec.baseUrl || DEFAULT_BASE_URLS[spec.provider];
  if (!baseUrl) throw new Error(`Unknown API provider '${spec.provider}'; set processors.tts.baseUrl explicitly`);
  const dashscope = DASHSCOPE_PROVIDERS.has(spec.provider);
  if (dashscope && !spec.apiKeyEnv) throw new Error('processors.tts.apiKeyEnv is required for DashScope');
  if (dashscope && !spec.voice) throw new Error('processors.tts.voice is required for DashScope');
  const key = spec.apiKeyEnv ? process.env[spec.apiKeyEnv] : undefined;
  if (spec.apiKeyEnv && !key) throw new Error(`Missing API key: set $${spec.apiKeyEnv}`);
  if (!spec.model) throw new Error('processors.tts.model is required for api runner');

  const response = await fetch(`${baseUrl.replace(/\/$/, '')}${dashscope ? '/services/aigc/multimodal-generation/generation' : '/audio/speech'}`, {
    method: 'POST',
    headers: {'Content-Type': 'application/json', ...(key ? {Authorization: `Bearer ${key}`} : {})},
    body: JSON.stringify(dashscope ? dashscopeSpeechBody(spec, io) : apiSpeechBody(spec, io)),
  });
  if (!response.ok) throw new Error(`TTS API ${spec.provider} failed: ${response.status} ${await response.text()}`);
  if (!dashscope) {
    writeFileSync(io.outPath, Buffer.from(await response.arrayBuffer()));
    return;
  }

  let rawPayload: unknown;
  try {
    rawPayload = await response.json() as unknown;
  } catch {
    throw new Error('DashScope returned invalid JSON');
  }
  if (typeof rawPayload !== 'object' || rawPayload === null || Array.isArray(rawPayload)) throw new Error('DashScope returned invalid JSON');
  const payload = rawPayload as {output?: {audio?: {url?: unknown; data?: unknown}}; message?: unknown};
  const audio = payload.output?.audio;
  if (typeof audio?.url === 'string' && audio.url) {
    let protocol: string;
    try {
      protocol = new URL(audio.url).protocol;
    } catch {
      throw new Error('DashScope returned an invalid audio URL');
    }
    if (protocol !== 'http:' && protocol !== 'https:') throw new Error(`DashScope returned unsupported audio URL: ${protocol}`);
    const download = await fetch(audio.url);
    if (!download.ok) throw new Error(`DashScope audio download failed: ${download.status} ${await download.text()}`);
    const bytes = Buffer.from(await download.arrayBuffer());
    if (bytes.length === 0) throw new Error('DashScope audio download was empty');
    writeFileSync(io.outPath, bytes);
    return;
  }
  if (typeof audio?.data === 'string' && audio.data) {
    const data = audio.data.trim();
    if (!/^(?:[A-Za-z\d+/]{4})*(?:[A-Za-z\d+/]{2}==|[A-Za-z\d+/]{3}=)?$/.test(data)) {
      throw new Error('DashScope returned invalid Base64 audio');
    }
    const bytes = Buffer.from(data, 'base64');
    if (bytes.length > 0) {
      writeFileSync(io.outPath, bytes);
      return;
    }
  }
  throw new Error(`DashScope returned no audio${payload.message ? `: ${String(payload.message)}` : ''}`);
}

/** Build a speech request while keeping configured identity and segment text authoritative. */
export function apiSpeechBody(spec: ApiProcessor, io: {text: string; options?: Record<string, unknown>}): Record<string, unknown> {
  return {...spec.options, ...io.options, model: spec.model, input: io.text, voice: spec.voice};
}
