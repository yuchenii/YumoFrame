/** Synthesize a voice track from text, and derive timing without an ASR round-trip when possible. */
import {execFile} from 'node:child_process';
import {existsSync, mkdirSync, readFileSync, realpathSync, renameSync, rmSync, statSync, writeFileSync} from 'node:fs';
import {basename, dirname, extname, isAbsolute, relative, resolve, sep} from 'node:path';
import {fileURLToPath} from 'node:url';
import {promisify} from 'node:util';
import {CONFIG_FILE, loadConfig} from '../config.js';
import {parseTranscript} from '../json.js';
import {formatTranscriptMd} from '../transcript-md.js';
import {fillArgs, optionFlags, type ProcessInvocation, processorEnvironmentDir, run, runApiSpeech} from '../processor-runtime.js';
import {subtitlesToTranscript} from '../subtitles.js';
import {transcribeInvocation} from './transcribe.js';
import {parseSpeechPlan, resolveTtsCapabilities, resolveTtsProfile, validateSpeechPlan, validateTtsConfiguration} from '../tts-plan.js';
import type {Processor, SpeechPlan, Transcript, TtsCapabilities, TtsProfile, YumoFrameConfig} from '../types.js';

// Commands live in src/commands → package root is two levels up.
const packageRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');
const execFileAsync = promisify(execFile);
const UNSPOKEN_PUNCTUATION = new Set([...`，。！？!?、；;：:,.…—-“”‘’（）()[]【】《》〈〉`]);
const MAX_TRAILING_AUDIO_SECONDS = 1.5;

export type SynthesizeTimingMode = 'native' | 'fragment-align' | 'whole-align' | 'asr-fallback' | 'audio-only';

export interface SynthesizeResult {
  outputPath: string;
  transcriptPath?: string;
  duration: number;
  tts: {
    runner: Processor['runner'];
    processor: string | null;
    provider: string | null;
    model: string | null;
    voice: string | null;
    profile: string;
  };
  timingMode: SynthesizeTimingMode;
  lastTimestamp: number | null;
  coverage: number;
  reviewRequired: boolean;
}

interface FragmentAlignmentItem {
  id: string;
  transcript: Transcript;
  valid: boolean;
  issues: string[];
}

interface FragmentAlignment {
  version: 1;
  items: FragmentAlignmentItem[];
}

function projectRelativeOutput(root: string, outputPath: string): string {
  const path = relative(root, outputPath);
  if (!path || path === '..' || path.startsWith(`..${sep}`) || isAbsolute(path)) {
    throw new Error(`TTS output must be inside the project: ${outputPath}`);
  }

  let ancestor = dirname(outputPath);
  while (!existsSync(ancestor)) ancestor = dirname(ancestor);
  const physicalPath = relative(realpathSync(root), realpathSync(ancestor));
  if (physicalPath === '..' || physicalPath.startsWith(`..${sep}`) || isAbsolute(physicalPath)) {
    throw new Error(`TTS output must be inside the project: ${outputPath}`);
  }
  return path.split(sep).join('/');
}

function persistOutputPaths(root: string, config: YumoFrameConfig, output: string): void {
  const configPath = resolve(root, CONFIG_FILE);
  const temporaryPath = `${configPath}.tmp-${process.pid}`;
  const next = {...config, paths: {...config.paths, media: output, voice: output}};
  try {
    writeFileSync(temporaryPath, `${JSON.stringify(next, null, 2)}\n`);
    renameSync(temporaryPath, configPath);
  } finally {
    rmSync(temporaryPath, {force: true});
  }
}

async function audioDuration(path: string): Promise<number> {
  const {stdout} = await execFileAsync('ffprobe', [
    '-v', 'error', '-show_entries', 'format=duration', '-of', 'default=noprint_wrappers=1:nokey=1', path,
  ]);
  const duration = Number(stdout.trim());
  if (!Number.isFinite(duration) || duration < 0) throw new Error(`Could not determine audio duration: ${path}`);
  return duration;
}

function lastTranscriptTimestamp(transcript?: Transcript): number | null {
  if (!transcript || transcript.segments.length === 0) return null;
  const timestamps = transcript.segments.map((segment) => segment.timestamp?.at(-1)?.[1] !== undefined
    ? Number(segment.timestamp.at(-1)![1]) / 1000
    : segment.end).filter(Number.isFinite);
  return timestamps.length > 0 ? Math.max(...timestamps) : null;
}

function synthesisResult({outputPath, transcriptPath, duration, tts, timingMode, transcript}: {
  outputPath: string;
  transcriptPath?: string;
  duration: number;
  tts: Processor;
  timingMode: SynthesizeTimingMode;
  transcript?: Transcript;
}): SynthesizeResult {
  const selected = resolveTtsCapabilities(tts).selected;
  const lastTimestamp = lastTranscriptTimestamp(transcript);
  return {
    outputPath,
    ...(transcriptPath ? {transcriptPath} : {}),
    duration,
    tts: {
      runner: selected.runner,
      processor: selected.processor ?? null,
      provider: selected.provider ?? null,
      model: selected.model ?? null,
      voice: selected.speaker ?? selected.voice ?? null,
      profile: selected.profile,
    },
    timingMode,
    lastTimestamp,
    coverage: lastTimestamp === null || duration === 0 ? 0 : Math.round((lastTimestamp / duration) * 1_000_000) / 1_000_000,
    reviewRequired: timingMode === 'asr-fallback',
  };
}

function uvOptions(config: YumoFrameConfig, root?: string): Record<string, string | number> {
  const tts = config.processors.tts;
  if (!tts || tts.runner !== 'uv') throw new Error('processors.tts must use runner "uv"');
  const options = {...tts.options};
  if (root && typeof options.refAudio === 'string' && !isAbsolute(options.refAudio) && !/^[a-z][a-z\d+.-]*:/i.test(options.refAudio)) {
    options.refAudio = resolve(root, options.refAudio);
  }
  return options;
}

/** Build the spawn invocation for a bundled uv TTS processor. */
export function synthesizeInvocation({config, text, outPath, root}: {config: YumoFrameConfig; text: string; outPath: string; root?: string}): ProcessInvocation {
  const tts = config.processors.tts;
  if (!tts || tts.runner !== 'uv') throw new Error('processors.tts must use runner "uv"');
  const projectDir = resolve(packageRoot, 'runtime', 'processors', tts.name);
  return {
    command: tts.uvBin || 'uv',
    args: [
      'run', '--project', projectDir, '--locked',
      tts.name, '--text', text, '--output', outPath,
      ...optionFlags(uvOptions(config, root)),
    ],
    env: {
      ...process.env,
      ...tts.env,
      UV_PROJECT_ENVIRONMENT: processorEnvironmentDir(tts.name, config.runtimeVersion),
    },
  };
}

/** Build one plan-aware uv invocation so a local model is loaded only once. */
export function synthesizePlanInvocation({config, planPath, outputDir, root}: {config: YumoFrameConfig; planPath: string; outputDir: string; root?: string}): ProcessInvocation {
  const tts = config.processors.tts;
  if (!tts || tts.runner !== 'uv') throw new Error('processors.tts must use runner "uv"');
  const projectDir = resolve(packageRoot, 'runtime', 'processors', tts.name);
  return {
    command: tts.uvBin || 'uv',
    args: [
      'run', '--project', projectDir, '--locked',
      tts.name, '--plan', planPath, '--output-dir', outputDir,
      ...optionFlags(uvOptions(config, root)),
    ],
    env: {
      ...process.env,
      ...tts.env,
      UV_PROJECT_ENVIRONMENT: processorEnvironmentDir(tts.name, config.runtimeVersion),
    },
  };
}

/** Resolve project TTS capabilities without loading a model. */
export function synthesizeCapabilities(start = process.cwd()): TtsCapabilities {
  const {config} = loadConfig(start);
  if (!config.processors.tts) throw new Error('processors.tts is not configured in yumoframe.config.json');
  return resolveTtsCapabilities(config.processors.tts);
}

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
  const outputBase = resolve(dirname(audioPath), `yf-tmp-align-${process.pid}-${basename(audioPath, extname(audioPath))}`);
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

async function alignFragments(config: YumoFrameConfig, align: Processor, plan: SpeechPlan, fragments: string[], directory: string): Promise<FragmentAlignment> {
  const manifestPath = resolve(directory, 'align-manifest.json');
  const outputBase = resolve(directory, 'aligned');
  writeFileSync(manifestPath, `${JSON.stringify({
    version: 1,
    items: plan.segments.map((segment, index) => ({
      id: segment.id,
      audio: relative(directory, fragments[index]!).split(sep).join('/'),
      text: segment.text,
    })),
  }, null, 2)}\n`);
  try {
    if (align.runner === 'command') {
      if (align.command.length === 0) throw new Error('processors.align.command must be a non-empty array');
      await run(align.command[0]!, [...align.command.slice(1), '--align-manifest', manifestPath, '-o', outputBase], {...process.env, ...align.env});
    } else if (align.runner === 'uv') {
      const projectDir = resolve(packageRoot, 'runtime', 'processors', align.name);
      if (align.name !== 'funasr' || !existsSync(resolve(projectDir, 'pyproject.toml'))) {
        throw new Error(`Fragment alignment requires the bundled FunASR processor`);
      }
      await run(align.uvBin || 'uv', [
        'run', '--project', projectDir, '--locked',
        'media-text', '--align-manifest', manifestPath, '-o', outputBase,
        ...optionFlags(align.options),
      ], {...process.env, ...align.env, UV_PROJECT_ENVIRONMENT: processorEnvironmentDir(align.name, config.runtimeVersion)});
    } else {
      throw new Error('Fragment alignment via the api runner is not supported');
    }
    return JSON.parse(readFileSync(`${outputBase}.json`, 'utf8')) as FragmentAlignment;
  } finally {
    rmSync(manifestPath, {force: true});
    rmSync(`${outputBase}.json`, {force: true});
    rmSync(`${outputBase}.txt`, {force: true});
  }
}

function mergeFragmentTranscripts(alignment: FragmentAlignment, plan: SpeechPlan, duration: number): Transcript | undefined {
  if (alignment?.version !== 1 || !Array.isArray(alignment.items) || alignment.items.length !== plan.segments.length) return undefined;
  let offset = 0;
  const segments = [];
  for (const [index, planned] of plan.segments.entries()) {
    const item = alignment.items[index];
    const fragmentDuration = Number(item?.transcript?.duration);
    if (!item || !item.transcript || item.id !== planned.id || !item.valid || !Number.isFinite(fragmentDuration) || fragmentDuration < 0) return undefined;
    if (alignmentIssues(item.transcript, planned.text, fragmentDuration).length > 0) return undefined;
    const offsetMs = Math.round(offset * 1000);
    segments.push(...item.transcript.segments.map((segment) => ({
      ...segment,
      start: segment.start + offset,
      end: segment.end + offset,
      ...(segment.timestamp ? {timestamp: segment.timestamp.map(([start, end, ...rest]) => [start + offsetMs, end + offsetMs, ...rest])} : {}),
    })));
    offset += fragmentDuration + planned.pauseAfterMs / 1000;
  }
  return {
    engine: 'funasr-fa-fragments',
    language: alignment.items[0]?.transcript.language ?? 'zh',
    duration,
    segments,
  };
}

function alignmentIssues(transcript: Transcript | undefined, text: string, duration: number): string[] {
  const expectedTokens = (text.match(/[A-Za-z0-9]+|./gsu) ?? []).filter((piece) => !UNSPOKEN_PUNCTUATION.has(piece) && !/^\s+$/u.test(piece)).length;
  if (!transcript || !Array.isArray(transcript.segments) || transcript.segments.length === 0
    || transcript.segments.some((segment) => !Array.isArray(segment.timestamp) || segment.timestamp.length === 0
      || segment.timestamp.some((stamp) => !Array.isArray(stamp) || stamp.length < 2 || !Number.isFinite(stamp[0]) || !Number.isFinite(stamp[1])))) {
    return ['missing-timestamps'];
  }
  const timestamps = transcript.segments.flatMap((segment) => segment.timestamp!);
  const issues: string[] = [];
  if (timestamps.length !== expectedTokens) issues.push('token-count-mismatch');
  if (timestamps.some(([start, end], index) => start === undefined || end === undefined || start > end
    || (index > 0 && (start < timestamps[index - 1]![0]! || end < timestamps[index - 1]![1]!)))) {
    issues.push('non-monotonic-timestamps');
  }
  if (timestamps.some(([start, end]) => start === undefined || end === undefined || start < 0 || end > duration * 1000)) {
    issues.push('timestamp-out-of-range');
  }
  if (duration - timestamps.at(-1)![1]! / 1000 > MAX_TRAILING_AUDIO_SECONDS) issues.push('trailing-audio');
  return issues;
}

async function fallbackToAsr({root, config, output, outputPath, duration, tts}: {
  root: string;
  config: YumoFrameConfig;
  output: string;
  outputPath: string;
  duration: number;
  tts: Processor;
}): Promise<SynthesizeResult> {
  const transcriptPath = resolve(root, config.paths.transcript);
  const outputBase = resolve(dirname(transcriptPath), `yf-tmp-asr-${process.pid}-${Date.now()}`);
  try {
    const invocation = transcribeInvocation({
      root,
      config: {...config, paths: {...config.paths, media: output}},
      outputBase,
    });
    await run(invocation.command, invocation.args, invocation.env);
    const transcript = parseTranscript(readFileSync(`${outputBase}.json`, 'utf8'), `${outputBase}.json`);
    transcript.duration = duration;
    const written = writeTranscript(root, config, transcript);
    return synthesisResult({outputPath, transcriptPath: written, duration, tts, timingMode: 'asr-fallback', transcript});
  } catch (error) {
    rmSync(transcriptPath, {force: true});
    rmSync(resolve(root, config.paths.transcriptMd || 'transcript.md'), {force: true});
    console.warn(`ASR fallback unavailable (${error instanceof Error ? error.message : error}); keeping audio only.`);
    return synthesisResult({outputPath, duration, tts, timingMode: 'audio-only'});
  } finally {
    rmSync(`${outputBase}.json`, {force: true});
    rmSync(`${outputBase}.txt`, {force: true});
  }
}

function setCommandOption(argv: string[], name: string, value: string): void {
  const equalsIndex = argv.findIndex((arg) => arg.startsWith(`${name}=`));
  if (equalsIndex >= 0) {
    argv[equalsIndex] = `${name}=${value}`;
    return;
  }
  const index = argv.indexOf(name);
  if (index >= 0 && index + 1 < argv.length) {
    argv[index + 1] = value;
    return;
  }
  argv.push(`${name}=${value}`);
}

async function planFragments({config, root, planPath, plan, profile, outputDir, extension}: {
  config: YumoFrameConfig;
  root: string;
  planPath: string;
  plan: SpeechPlan;
  profile: TtsProfile;
  outputDir: string;
  extension: string;
}): Promise<string[]> {
  const tts = config.processors.tts!;
  if (tts.runner === 'uv' && profile.execution === 'native-batch') {
    if (tts.name !== 'qwen3-tts') throw new Error(`TTS profile '${profile.id}' has no bundled plan-aware worker`);
    const invocation = synthesizePlanInvocation({config, planPath, outputDir, root});
    await run(invocation.command, invocation.args, invocation.env);
    const outputs = plan.segments.map((_, index) => resolve(outputDir, `${String(index).padStart(4, '0')}.wav`));
    if (outputs.some((path) => !existsSync(path))) throw new Error(`TTS profile '${profile.id}' did not write every planned fragment`);
    return outputs;
  }
  if (tts.runner === 'uv' && plan.segments.length === 1) {
    const output = resolve(outputDir, `0000${extension}`);
    const invocation = synthesizeInvocation({config, text: plan.segments[0]!.text, outPath: output, root});
    await run(invocation.command, invocation.args, invocation.env);
    return [output];
  }
  if (tts.runner === 'uv') throw new Error(`TTS profile '${profile.id}' cannot execute a segmented plan without a plan-aware worker`);

  const outputs: string[] = [];
  for (const [index, segment] of plan.segments.entries()) {
    const output = resolve(outputDir, `${String(index).padStart(4, '0')}${extension}`);
    if (tts.runner === 'api') {
      const options = segment.control.type === 'openai-speech'
        ? {instructions: segment.control.instructions, speed: segment.control.speed}
        : segment.control.type === 'dashscope-instruct'
          ? {instructions: segment.control.instructions}
        : undefined;
      await runApiSpeech(tts, {text: segment.text, outPath: output, options});
    } else {
      const subs = resolve(outputDir, `${String(index).padStart(4, '0')}.vtt`);
      const argv = fillArgs(tts.command, {text: segment.text, out: output, subs});
      if (segment.control.type === 'edge-prosody') {
        setCommandOption(argv, '--rate', segment.control.rate);
        setCommandOption(argv, '--pitch', segment.control.pitch);
        setCommandOption(argv, '--volume', segment.control.volume);
      }
      await run(argv[0]!, argv.slice(1), {...process.env, ...tts.env});
    }
    outputs.push(output);
  }
  return outputs;
}

async function mergeFragments(fragments: string[], plan: SpeechPlan, output: string): Promise<void> {
  if (fragments.length !== plan.segments.length) throw new Error('TTS fragment count does not match speech plan');
  const filter: string[] = [];
  const inputs: string[] = [];
  for (const [index, fragment] of fragments.entries()) {
    inputs.push('-i', fragment);
    filter.push(`[${index}:a]aformat=sample_fmts=fltp:sample_rates=24000:channel_layouts=mono[a${index}]`);
  }
  const concat: string[] = [];
  for (const [index, segment] of plan.segments.entries()) {
    concat.push(`[a${index}]`);
    if (segment.pauseAfterMs > 0) {
      filter.push(`anullsrc=r=24000:cl=mono:d=${(segment.pauseAfterMs / 1000).toFixed(3)}[s${index}]`);
      concat.push(`[s${index}]`);
    }
  }
  filter.push(`${concat.join('')}concat=n=${concat.length}:v=0:a=1[out]`);
  await run('ffmpeg', ['-hide_banner', '-loglevel', 'error', ...inputs, '-filter_complex', filter.join(';'), '-map', '[out]', '-y', output]);
}

/**
 * Run the configured TTS processor to turn text into an audio file, and — when the engine
 * emits subtitles or a forced aligner is configured — produce transcript.json so the TTS
 * route skips ASR entirely (no source/recognized-text mismatch).
 * @returns Written audio path and, when timing was derived, the transcript path.
 */
export async function synthesizeProject({text, input, plan: requestedPlan, out, start = process.cwd()}: {text?: string; input?: string; plan?: string; out?: string; start?: string} = {}): Promise<SynthesizeResult> {
  const {root, config} = loadConfig(start);
  const tts = config.processors.tts;
  if (!tts) throw new Error('processors.tts is not configured in yumoframe.config.json');

  if (requestedPlan && (text !== undefined || input !== undefined)) throw new Error('--plan cannot be combined with --text or --input');
  const planPath = requestedPlan ? resolve(root, requestedPlan) : undefined;
  const speechPlan = planPath ? parseSpeechPlan(readFileSync(planPath, 'utf8'), requestedPlan) : undefined;
  const canonicalTextPath = resolve(root, config.paths.ttsText ?? 'text.txt');
  if (speechPlan && resolve(root, speechPlan.source) !== canonicalTextPath) {
    throw new Error(`speech.json source must reference the configured TTS text: ${config.paths.ttsText ?? 'text.txt'}`);
  }
  const content = speechPlan
    ? readFileSync(canonicalTextPath, 'utf8')
    : text ?? readFileSync(resolve(root, input ?? config.paths.ttsText ?? 'text.txt'), 'utf8').trim();
  if (!content.trim()) throw new Error('No text to synthesize (empty input)');
  const profile = resolveTtsProfile(tts);
  validateTtsConfiguration(profile, tts, root, speechPlan ? 'plan' : 'whole');
  if (speechPlan) validateSpeechPlan(speechPlan, content, profile);

  const outputPath = resolve(root, out ?? config.paths.media);
  const output = projectRelativeOutput(root, outputPath);
  mkdirSync(dirname(outputPath), {recursive: true});
  const extension = extname(outputPath) || '.mp3';
  // Unique temp paths (visible, `yf-tmp-` prefixed), then atomically replace the target. Cleaned in finally.
  const stem = `yf-tmp-${basename(outputPath, extension)}-${process.pid}`;
  const temp = resolve(dirname(outputPath), `${stem}${extension}`);
  const subsPath = resolve(dirname(outputPath), `${stem}.vtt`);
  const segmentsDir = resolve(dirname(outputPath), `${stem}-segments`);

  try {
    let subtitlesProduced = false;
    let fragmentAlignment: FragmentAlignment | undefined;
    if (speechPlan && planPath) {
      if (tts.runner === 'uv' && tts.name === 'qwen3-tts' && extension !== '.wav') throw new Error('Qwen3-TTS speech plans require a .wav output path');
      mkdirSync(segmentsDir, {recursive: true});
      const fragments = await planFragments({config, root, planPath, plan: speechPlan, profile, outputDir: segmentsDir, extension});
      if (config.processors.align) {
        try {
          fragmentAlignment = await alignFragments(config, config.processors.align, speechPlan, fragments, segmentsDir);
        } catch (error) {
          console.warn(`Fragment alignment failed (${error instanceof Error ? error.message : error}); falling back after audio merge.`);
        }
      }
      await mergeFragments(fragments, speechPlan, temp);
    } else if (tts.runner === 'api') {
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
      const invocation = synthesizeInvocation({config, text: content, outPath: temp, root});
      await run(invocation.command, invocation.args, invocation.env);
    }
    renameSync(temp, outputPath);
    persistOutputPaths(root, config, output);
    const duration = await audioDuration(outputPath);

    if (speechPlan) {
      const transcript = fragmentAlignment ? mergeFragmentTranscripts(fragmentAlignment, speechPlan, duration) : undefined;
      if (!transcript) return fallbackToAsr({root, config, output, outputPath, duration, tts});
      const transcriptPath = writeTranscript(root, config, transcript);
      return synthesisResult({outputPath, transcriptPath, duration, tts, timingMode: 'fragment-align', transcript});
    }

    // Tier 1: TTS emitted subtitles → use them directly (no ASR, no mismatch).
    if (subtitlesProduced && existsSync(subsPath) && statSync(subsPath).size > 0) {
      try {
        const transcript = subtitlesToTranscript(readFileSync(subsPath, 'utf8'));
        transcript.duration = duration;
        const transcriptPath = writeTranscript(root, config, transcript);
        return synthesisResult({outputPath, transcriptPath, duration, tts, timingMode: 'native', transcript});
      } catch (error) {
        // Malformed subtitles: warn and fall through to forced align / ASR rather than aborting.
        console.warn(`Subtitle parse failed (${error instanceof Error ? error.message : error}); falling back.`);
      }
    }

    // Tier 2: no native timestamps but text is known → forced alignment.
    if (config.processors.align) {
      try {
        const transcript = await forcedAlign(config, config.processors.align, outputPath, content);
        transcript.duration = duration;
        const issues = alignmentIssues(transcript, content, duration);
        if (issues.length === 0) {
          const transcriptPath = writeTranscript(root, config, transcript);
          return synthesisResult({outputPath, transcriptPath, duration, tts, timingMode: 'whole-align', transcript});
        }
        console.warn(`Forced alignment rejected (${issues.join(', ')}); falling back.`);
      } catch (error) {
        console.warn(`Forced alignment failed (${error instanceof Error ? error.message : error}); falling back.`);
      }
    }

    // Tier 3: recognize the promoted final audio once; keep it audio-only if ASR is unavailable.
    return fallbackToAsr({root, config, output, outputPath, duration, tts});
  } finally {
    // temp is gone after a successful rename (no-op); on failure it may linger — remove both.
    rmSync(temp, {force: true});
    rmSync(subsPath, {force: true});
    rmSync(segmentsDir, {recursive: true, force: true});
  }
}
