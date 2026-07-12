/** Run ASR on project media and extract a voice track for downstream alignment. */
import {spawn} from 'node:child_process';
import {existsSync, mkdirSync, readFileSync, renameSync, unlinkSync, writeFileSync} from 'node:fs';
import {homedir, platform} from 'node:os';
import {basename, dirname, extname, resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {loadConfig} from '../config.js';
import {parseTranscript} from '../json.js';
import {formatTranscriptMd} from '../transcript-md.js';
import type {Transcript, YumoFrameConfig} from '../types.js';

// Commands live in src/commands → package root is two levels up.
const packageRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');

/** OS-specific cache root used for processor virtualenvs. */
function cacheRoot(): string {
  if (platform() === 'win32') return process.env.LOCALAPPDATA || resolve(homedir(), 'AppData', 'Local');
  if (platform() === 'darwin') return resolve(homedir(), 'Library', 'Caches');
  return process.env.XDG_CACHE_HOME || resolve(homedir(), '.cache');
}

/**
 * Path of the cached uv/venv environment for the funasr processor.
 * @param runtimeVersion Config `runtimeVersion` used as the env key.
 * @returns Absolute venv directory under the OS cache.
 */
export function processorEnvironmentDir(runtimeVersion: string): string {
  // Version-keyed so runtime bumps get a fresh venv.
  return resolve(cacheRoot(), 'yumoframe', 'venvs', 'funasr', runtimeVersion);
}

/** Command, args, and env used to invoke the configured ASR processor. */
export interface ProcessInvocation {
  command: string;
  args: string[];
  env: NodeJS.ProcessEnv;
}

/**
 * Build the spawn invocation for built-in funasr or a custom ASR command.
 * @param options.root Project root.
 * @param options.config Loaded YumoFrame config.
 * @param options.outputBase Temp output basename (without extension) for the processor.
 * @returns Command/args/env ready for `spawn`.
 */
export function transcribeInvocation({root, config, outputBase}: {root: string; config: YumoFrameConfig; outputBase: string}): ProcessInvocation {
  const asr = config.processors.asr;
  if (asr.type === 'command') {
    // Custom: command[0] is the executable; remaining args + media + outputBase.
    if (!Array.isArray(asr.command) || asr.command.length === 0) throw new Error('processors.asr.command must be a non-empty array');
    return {command: asr.command[0]!, args: [...asr.command.slice(1), resolve(root, config.paths.media), outputBase], env: {...process.env, ...asr.env}};
  }
  if ((asr.name || 'funasr') !== 'funasr') throw new Error(`Unsupported built-in ASR processor: ${asr.name}`);
  const options = asr.options ?? {};
  return {
    command: asr.runner || 'uv',
    args: [
      'run', '--project', resolve(packageRoot, 'runtime', 'processors', 'funasr'), '--locked',
      'media-text', resolve(root, config.paths.media), '-o', outputBase,
      '--device', options.device || 'auto',
      '--hotwords', options.hotwords || '',
      '--max-segment-ms', String(options.maxSegmentMs || 30000),
    ],
    env: {
      ...process.env,
      ...asr.env,
      // Pin uv's project env to the shared cache (not a local .venv).
      UV_PROJECT_ENVIRONMENT: processorEnvironmentDir(config.runtimeVersion),
    },
  };
}

function run(command: string, args: string[], env: NodeJS.ProcessEnv = process.env): Promise<void> {
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

/**
 * Transcribe media to transcript.json/.md and extract voice audio via ffmpeg.
 * @param start Directory to search upward for `yumoframe.config.json` (default: cwd).
 * @returns Paths of transcript JSON, transcript markdown, and voice file.
 */
export async function transcribeProject(start = process.cwd()): Promise<{transcriptPath: string; transcriptMdPath: string; voicePath: string}> {
  const {root, config} = loadConfig(start);
  const mediaPath = resolve(root, config.paths.media);
  if (!existsSync(mediaPath)) throw new Error(`Media file not found: ${mediaPath}`);

  const transcriptPath = resolve(root, config.paths.transcript);
  const transcriptMdPath = resolve(root, config.paths.transcriptMd || 'transcript.md');
  const voicePath = resolve(root, config.paths.voice);
  mkdirSync(dirname(transcriptPath), {recursive: true});
  mkdirSync(dirname(voicePath), {recursive: true});

  // Unique temp basename so parallel runs do not clobber each other.
  const outputBase = resolve(dirname(transcriptPath), `.${basename(transcriptPath, extname(transcriptPath))}-${process.pid}-${Date.now()}`);
  const invocation = transcribeInvocation({root, config, outputBase});
  await run(invocation.command, invocation.args, invocation.env);
  // Processor writes `${outputBase}.json` (+ optional `.txt`); promote JSON to the config path.
  renameSync(`${outputBase}.json`, transcriptPath);
  if (existsSync(`${outputBase}.txt`)) unlinkSync(`${outputBase}.txt`);

  const transcript = parseTranscript(readFileSync(transcriptPath, 'utf8'), transcriptPath);
  // Default cleaned text to raw text when ASR omitted cleaning.
  transcript.segments = (transcript.segments ?? []).map((segment) => ({
    ...segment,
    cleaned: segment.cleaned ?? segment.text,
  }));
  writeFileSync(transcriptPath, `${JSON.stringify(transcript, null, 2)}\n`);
  writeFileSync(transcriptMdPath, formatTranscriptMd(transcript));

  // Remove legacy plain-text transcript artifacts if present.
  for (const legacy of ['transcript.txt', 'transcript.cleaned.txt']) {
    const path = resolve(root, legacy);
    if (existsSync(path)) unlinkSync(path);
  }

  // Extract audio-only voice track, then atomically replace the target path.
  const extension = extname(voicePath) || '.m4a';
  const temporaryVoice = resolve(dirname(voicePath), `.${basename(voicePath, extension)}-${process.pid}${extension}`);
  await run('ffmpeg', ['-hide_banner', '-loglevel', 'error', '-y', '-i', mediaPath, '-vn', temporaryVoice]);
  renameSync(temporaryVoice, voicePath);
  return {transcriptPath, transcriptMdPath, voicePath};
}
