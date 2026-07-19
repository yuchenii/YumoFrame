/** Scaffold a new data-only YumoFrame project. */
import { existsSync, mkdirSync, readdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  getTemplateAdapter,
  getTemplateManifest,
  getTemplateRegistration,
} from "../templates/registry.ts";

const writeJson = (path: string, value: unknown): void =>
  writeFileSync(path, `${JSON.stringify(value, null, 2)}\n`);

/**
 * Create a new project at `dir` with config, lines, storyboard, and project stubs.
 * @param options.dir Target project directory (must be empty or missing).
 * @param options.template Exact built-in Template ID.
 * @returns Absolute path of the created project root.
 */
export function initProject({
  dir,
  template,
  preset,
}: {
  dir: string;
  template: string;
  preset?: string;
}): string {
  const canonicalTemplate = getTemplateRegistration(template).id;
  const adapter = getTemplateAdapter(canonicalTemplate);
  const manifest = getTemplateManifest(canonicalTemplate);
  const selectedPreset = preset ?? adapter.defaultPreset;
  if (selectedPreset && !manifest.presets[selectedPreset]) {
    throw new Error(`Unsupported preset for ${canonicalTemplate}: ${selectedPreset}`);
  }

  const root = resolve(dir);
  // Refuse to scaffold into a non-empty directory.
  if (existsSync(root) && readdirSync(root).length > 0)
    throw new Error(`Target directory is not empty: ${root}`);

  mkdirSync(resolve(root, "assets"), { recursive: true });
  mkdirSync(resolve(root, "out"), { recursive: true });
  writeFileSync(resolve(root, "assets", ".gitkeep"), "");
  // Default path conventions used by the rest of the CLI.
  writeJson(resolve(root, "yumoframe.config.json"), {
    framework: "yumoframe",
    version: "0.1.2",
    runtimeVersion: "0.1.2",
    template: canonicalTemplate,
    ...(selectedPreset ? { preset: selectedPreset } : {}),
    templateSource: "runtime",
    templatePath: null,
    paths: {
      media: "assets/input.wav",
      voice: "assets/voice.m4a",
      ttsText: "text.txt",
      transcript: "transcript.json",
      transcriptMd: "transcript.md",
      lines: "lines.json",
      storyboard: "storyboard.json",
      project: "project.json",
      projectMd: "project.md",
      layoutSvg: "out/layout-preview.svg",
      assets: "assets",
      output: "out/video.mp4",
    },
    render: { composition: manifest.compositionId, width: 1080, height: 1920, fps: 30 },
    processors: {
      asr: {
        runner: "uv",
        name: "funasr",
        env: {},
        options: { device: "auto", hotwords: "", maxSegmentMs: 30000 },
      },
      // Default local TTS: Qwen3-TTS 0.6B CustomVoice with the Mandarin Vivian voice.
      tts: {
        runner: "uv",
        name: "qwen3-tts",
        env: {},
        options: {
          model: "Qwen/Qwen3-TTS-12Hz-0.6B-CustomVoice",
          language: "Chinese",
          speaker: "Vivian",
          device: "auto",
        },
      },
      // Qwen emits audio without clocks: align the known source text instead of recognizing it again.
      align: {
        runner: "uv",
        name: "funasr",
        env: {},
        options: { model: "fa-zh", device: "auto" },
      },
    },
  });
  // Text source for `yumoframe synthesize`.
  writeFileSync(resolve(root, "text.txt"), "");
  const initial = adapter.createInitialFiles();
  for (const [path, value] of Object.entries(initial)) writeJson(resolve(root, path), value);

  return root;
}
