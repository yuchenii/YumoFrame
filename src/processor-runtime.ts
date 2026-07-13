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

/** Default base URLs for known OpenAI-compatible speech providers. */
const DEFAULT_BASE_URLS: Record<string, string> = {
  openai: 'https://api.openai.com/v1',
  'qwen3-tts': 'https://dashscope.aliyuncs.com/compatible-mode/v1',
  dashscope: 'https://dashscope.aliyuncs.com/compatible-mode/v1',
};

/**
 * Synthesize speech via an OpenAI-compatible `POST {baseUrl}/audio/speech` endpoint.
 * @param spec API processor config (provider/baseUrl/model/voice/apiKeyEnv/options).
 * @param io Text to speak and the output audio path to write.
 */
export async function runApiSpeech(spec: ApiProcessor, io: {text: string; outPath: string}): Promise<void> {
  const baseUrl = spec.baseUrl || DEFAULT_BASE_URLS[spec.provider];
  if (!baseUrl) throw new Error(`Unknown API provider '${spec.provider}'; set processors.tts.baseUrl explicitly`);
  const key = spec.apiKeyEnv ? process.env[spec.apiKeyEnv] : undefined;
  if (spec.apiKeyEnv && !key) throw new Error(`Missing API key: set $${spec.apiKeyEnv}`);
  if (!spec.model) throw new Error('processors.tts.model is required for api runner');

  const response = await fetch(`${baseUrl.replace(/\/$/, '')}/audio/speech`, {
    method: 'POST',
    headers: {'Content-Type': 'application/json', ...(key ? {Authorization: `Bearer ${key}`} : {})},
    body: JSON.stringify({model: spec.model, input: io.text, voice: spec.voice, ...spec.options}),
  });
  if (!response.ok) throw new Error(`TTS API ${spec.provider} failed: ${response.status} ${await response.text()}`);
  writeFileSync(io.outPath, Buffer.from(await response.arrayBuffer()));
}
