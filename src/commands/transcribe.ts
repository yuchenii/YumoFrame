/** Run ASR on project media and extract a voice track for downstream alignment. */
import {existsSync, mkdirSync, readFileSync, renameSync, unlinkSync, writeFileSync} from 'node:fs';
import {basename, dirname, extname, resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {loadConfig} from '../config.js';
import {parseTranscript} from '../json.js';
import {formatTranscriptMd} from '../transcript-md.js';
import {type ProcessInvocation, optionFlags, processorEnvironmentDir, run} from '../processor-runtime.js';
import type {YumoFrameConfig} from '../types.js';

// Commands live in src/commands → package root is two levels up.
const packageRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');

/**
 * Build the spawn invocation for the configured ASR processor (uv funasr or a custom command).
 * @param options.root Project root.
 * @param options.config Loaded YumoFrame config.
 * @param options.outputBase Temp output basename (without extension) for the processor.
 * @returns Command/args/env ready for `spawn`.
 */
export function transcribeInvocation({root, config, outputBase}: {root: string; config: YumoFrameConfig; outputBase: string}): ProcessInvocation {
  const asr = config.processors.asr;
  const mediaPath = resolve(root, config.paths.media);
  if (asr.runner === 'command') {
    // Custom: command[0] is the executable; remaining args + media + outputBase.
    if (asr.command.length === 0) throw new Error('processors.asr.command must be a non-empty array');
    return {command: asr.command[0]!, args: [...asr.command.slice(1), mediaPath, outputBase], env: {...process.env, ...asr.env}};
  }
  if (asr.runner === 'api') throw new Error('ASR via the api runner is not supported; use runner "uv" (funasr) or "command"');
  if (asr.name !== 'funasr') throw new Error(`Unsupported built-in ASR processor: ${asr.name}`);
  return {
    command: asr.uvBin || 'uv',
    args: [
      'run', '--project', resolve(packageRoot, 'runtime', 'processors', 'funasr'), '--locked',
      'media-text', mediaPath, '-o', outputBase,
      // options (device/hotwords/maxSegmentMs/model/…) forwarded as --kebab flags; CLI applies defaults.
      ...optionFlags(asr.options),
    ],
    env: {
      ...process.env,
      ...asr.env,
      // Pin uv's project env to the shared cache (not a local .venv), keyed per engine.
      UV_PROJECT_ENVIRONMENT: processorEnvironmentDir(asr.name, config.runtimeVersion),
    },
  };
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

  // Unique temp basename (visible, `yf-tmp-` prefixed) so parallel runs do not clobber each other.
  const outputBase = resolve(dirname(transcriptPath), `yf-tmp-${basename(transcriptPath, extname(transcriptPath))}-${process.pid}-${Date.now()}`);
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
  const temporaryVoice = resolve(dirname(voicePath), `yf-tmp-${basename(voicePath, extension)}-${process.pid}${extension}`);
  await run('ffmpeg', ['-hide_banner', '-loglevel', 'error', '-y', '-i', mediaPath, '-vn', temporaryVoice]);
  renameSync(temporaryVoice, voicePath);
  return {transcriptPath, transcriptMdPath, voicePath};
}
