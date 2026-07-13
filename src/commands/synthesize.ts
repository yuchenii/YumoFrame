/** Synthesize a voice track from text, and derive timing without an ASR round-trip when possible. */
import {existsSync, mkdirSync, readFileSync, renameSync, rmSync, statSync, writeFileSync} from 'node:fs';
import {basename, dirname, extname, resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {loadConfig} from '../config.js';
import {formatTranscriptMd} from '../transcript-md.js';
import {fillArgs, optionFlags, processorEnvironmentDir, run, runApiSpeech} from '../processor-runtime.js';
import {subtitlesToTranscript} from '../subtitles.js';
import type {Processor, Transcript, YumoFrameConfig} from '../types.js';

// Commands live in src/commands → package root is two levels up.
const packageRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');

/** Default cleaned text to raw, then write transcript.json + transcript.md. */
function writeTranscript(root: string, config: YumoFrameConfig, transcript: Transcript): string {
  transcript.segments = transcript.segments.map((segment) => ({...segment, cleaned: segment.cleaned ?? segment.text}));
  const transcriptPath = resolve(root, config.paths.transcript);
  const transcriptMdPath = resolve(root, config.paths.transcriptMd || 'transcript.md');
  mkdirSync(dirname(transcriptPath), {recursive: true});
  writeFileSync(transcriptPath, `${JSON.stringify(transcript, null, 2)}\n`);
  writeFileSync(transcriptMdPath, formatTranscriptMd(transcript));
  return transcriptPath;
}

/** Run a forced-alignment processor: (audio + known text) → transcript.json (tier-2). */
async function forcedAlign(config: YumoFrameConfig, align: Processor, audioPath: string, text: string): Promise<Transcript> {
  const textPath = resolve(dirname(audioPath), `yf-tmp-align-text-${process.pid}.txt`);
  const outputBase = resolve(dirname(audioPath), `yf-tmp-align-${process.pid}-${basename(audioPath)}`);
  writeFileSync(textPath, text);
  try {
    if (align.runner === 'command') {
      if (align.command.length === 0) throw new Error('processors.align.command must be a non-empty array');
      await run(align.command[0]!, [...align.command.slice(1), audioPath, textPath, outputBase], {...process.env, ...align.env});
    } else if (align.runner === 'uv') {
      const projectDir = resolve(packageRoot, 'runtime', 'processors', align.name);
      if (!existsSync(resolve(projectDir, 'pyproject.toml'))) {
        throw new Error(`Forced aligner '${align.name}' is not bundled yet; use runner "command" or provide TTS subtitles`);
      }
      // funasr: media-text <audio> --align <text> -o <base>; options (e.g. model) forwarded as flags.
      await run(align.uvBin || 'uv', [
        'run', '--project', projectDir, '--locked',
        'media-text', audioPath, '--align', textPath, '-o', outputBase,
        ...optionFlags(align.options),
      ], {...process.env, ...align.env, UV_PROJECT_ENVIRONMENT: processorEnvironmentDir(align.name, config.runtimeVersion)});
    } else {
      throw new Error('Forced alignment via the api runner is not supported; use runner "command"');
    }
    return JSON.parse(readFileSync(`${outputBase}.json`, 'utf8')) as Transcript;
  } finally {
    rmSync(textPath, {force: true});
    // funasr writes both .json and .txt beside the output base; clean both.
    rmSync(`${outputBase}.json`, {force: true});
    rmSync(`${outputBase}.txt`, {force: true});
  }
}

/**
 * Run the configured TTS processor to turn text into an audio file, and — when the engine
 * emits subtitles or a forced aligner is configured — produce transcript.json so the TTS
 * route skips ASR entirely (no source/recognized-text mismatch).
 * @returns Written audio path and, when timing was derived, the transcript path.
 */
export async function synthesizeProject({text, input, out, start = process.cwd()}: {text?: string; input?: string; out?: string; start?: string} = {}): Promise<{outputPath: string; transcriptPath?: string}> {
  const {root, config} = loadConfig(start);
  const tts = config.processors.tts;
  if (!tts) throw new Error('processors.tts is not configured in yumoframe.config.json');

  const content = text ?? readFileSync(resolve(root, input ?? config.paths.ttsText ?? 'text.txt'), 'utf8').trim();
  if (!content) throw new Error('No text to synthesize (empty input)');

  const outputPath = resolve(root, out ?? config.paths.media);
  mkdirSync(dirname(outputPath), {recursive: true});
  const extension = extname(outputPath) || '.mp3';
  // Unique temp paths (visible, `yf-tmp-` prefixed), then atomically replace the target. Cleaned in finally.
  const stem = `yf-tmp-${basename(outputPath, extension)}-${process.pid}`;
  const temp = resolve(dirname(outputPath), `${stem}${extension}`);
  const subsPath = resolve(dirname(outputPath), `${stem}.vtt`);

  try {
    let subtitlesProduced = false;
    if (tts.runner === 'api') {
      await runApiSpeech(tts, {text: content, outPath: temp});
    } else if (tts.runner === 'command') {
      if (tts.command.length === 0) throw new Error('processors.tts.command must be a non-empty array');
      // {text}/{out} always substituted; {subs} opts into tier-1 timing (e.g. edge-tts --write-subtitles).
      subtitlesProduced = tts.command.some((arg) => arg.includes('{subs}'));
      const argv = fillArgs(tts.command, {text: content, out: temp, subs: subsPath});
      await run(argv[0]!, argv.slice(1), {...process.env, ...tts.env});
    } else {
      const projectDir = resolve(packageRoot, 'runtime', 'processors', tts.name);
      if (!existsSync(resolve(projectDir, 'pyproject.toml'))) throw new Error(`Local TTS engine '${tts.name}' is not bundled yet; use runner "api" or "command"`);
      throw new Error(`Bundled uv TTS engine '${tts.name}' invocation is not implemented yet`);
    }
    renameSync(temp, outputPath);

    // Tier 1: TTS emitted subtitles → use them directly (no ASR, no mismatch).
    if (subtitlesProduced && existsSync(subsPath) && statSync(subsPath).size > 0) {
      try {
        return {outputPath, transcriptPath: writeTranscript(root, config, subtitlesToTranscript(readFileSync(subsPath, 'utf8')))};
      } catch (error) {
        // Malformed subtitles: warn and fall through to forced align / ASR rather than aborting.
        console.warn(`Subtitle parse failed (${error instanceof Error ? error.message : error}); falling back.`);
      }
    }

    // Tier 2: no native timestamps but text is known → forced alignment.
    if (config.processors.align) {
      const transcript = await forcedAlign(config, config.processors.align, outputPath, content);
      return {outputPath, transcriptPath: writeTranscript(root, config, transcript)};
    }

    // Tier 3: audio only → fall back to ASR via `yumoframe transcribe`.
    return {outputPath};
  } finally {
    // temp is gone after a successful rename (no-op); on failure it may linger — remove both.
    rmSync(temp, {force: true});
    rmSync(subsPath, {force: true});
  }
}
