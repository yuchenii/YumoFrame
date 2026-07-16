/** Scaffold a new YumoFrame project directory with default comedy-text artifacts. */
import {existsSync, mkdirSync, readdirSync, writeFileSync} from 'node:fs';
import {resolve} from 'node:path';

const writeJson = (path: string, value: unknown): void => writeFileSync(path, `${JSON.stringify(value, null, 2)}\n`);

/**
 * Create a new project at `dir` with config, lines, storyboard, and project stubs.
 * @param options.dir Target project directory (must be empty or missing).
 * @param options.template Template id (currently only `comedy-text`).
 * @returns Absolute path of the created project root.
 */
export function initProject({dir, template}: {dir: string; template: string}): string {
  if (template !== 'comedy-text') throw new Error(`Unsupported template: ${template}`);

  const root = resolve(dir);
  // Refuse to scaffold into a non-empty directory.
  if (existsSync(root) && readdirSync(root).length > 0) throw new Error(`Target directory is not empty: ${root}`);

  mkdirSync(resolve(root, 'assets'), {recursive: true});
  mkdirSync(resolve(root, 'out'), {recursive: true});
  writeFileSync(resolve(root, 'assets', '.gitkeep'), '');
  // Default path conventions used by the rest of the CLI.
  writeJson(resolve(root, 'yumoframe.config.json'), {
    framework: 'yumoframe',
    version: '0.1.1',
    runtimeVersion: '0.1.1',
    template,
    templateSource: 'runtime',
    templatePath: null,
    paths: {
      media: 'assets/input.wav',
      voice: 'assets/voice.m4a',
      ttsText: 'text.txt',
      transcript: 'transcript.json',
      transcriptMd: 'transcript.md',
      lines: 'lines.json',
      storyboard: 'storyboard.json',
      project: 'project.json',
      projectMd: 'project.md',
      layoutSvg: 'out/layout-preview.svg',
      assets: 'assets',
      output: 'out/video.mp4',
    },
    render: {composition: 'ComedyTextVideo', width: 1080, height: 1920, fps: 30},
    processors: {
      asr: {
        runner: 'uv',
        name: 'funasr',
        env: {},
        options: {device: 'auto', hotwords: '', maxSegmentMs: 30000},
      },
      // Default local TTS: Qwen3-TTS 0.6B CustomVoice with the Mandarin Vivian voice.
      tts: {
        runner: 'uv',
        name: 'qwen3-tts',
        env: {},
        options: {
          model: 'Qwen/Qwen3-TTS-12Hz-0.6B-CustomVoice',
          language: 'Chinese',
          speaker: 'Vivian',
          device: 'auto',
        },
      },
      // Qwen emits audio without clocks: align the known source text instead of recognizing it again.
      align: {
        runner: 'uv',
        name: 'funasr',
        env: {},
        options: {model: 'fa-zh', device: 'auto'},
      },
    },
  });
  // Text source for `yumoframe synthesize`.
  writeFileSync(resolve(root, 'text.txt'), '');
  // Stub line so validate/resolve have something to work with.
  writeJson(resolve(root, 'lines.json'), {
    version: '0.1.0',
    template,
    lines: [{start: 0, end: 0.8, segments: [{text: '示例', highlight: false}]}],
  });
  writeJson(resolve(root, 'storyboard.json'), {
    version: '0.1.0',
    template,
    endOverview: true,
    scenes: [{lines: [{start: 0, end: 0.8, segments: [{text: '示例', highlight: false}]}]}],
  });
  // Empty timeline: caller must run resolve after authoring.
  writeJson(resolve(root, 'project.json'), {
    version: '0.1.0',
    template,
    endOverview: true,
    composition: {width: 1080, height: 1920, fps: 30, duration: 1, background: '#000000'},
    source: {type: 'text', text: ''},
    theme: {
      fontFamily: "system-ui, -apple-system, BlinkMacSystemFont, 'PingFang SC', 'Microsoft YaHei', sans-serif",
      textColor: '#FFFFFF',
      highlightColor: '#65F2A3',
      cursorColor: '#FFFFFF',
      dimCursorColor: '#7A7A7A',
    },
    timeline: {virtualCanvas: {width: 40000, height: 40000}, scenes: []},
  });

  return root;
}
