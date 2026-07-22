import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import { synthesizeCapabilities } from "../packages/cli/dist/commands/synthesize.js";

const json = (path) => JSON.parse(readFileSync(path, "utf8"));
const projectWithTts = (tts) => {
  const root = mkdtempSync(join(tmpdir(), "yumoframe-tts-capabilities-"));
  writeFileSync(
    join(root, "yumoframe.config.json"),
    `${JSON.stringify(
      {
        version: "0.1.0",
        runtimeVersion: "0.1.1",
        template: "rotating-flow",
        templateSource: "runtime",
        templatePath: null,
        paths: {
          media: "assets/input.wav",
          voice: "assets/input.wav",
          transcript: "transcript.json",
          transcriptMd: "transcript.md",
          lines: "lines.json",
          storyboard: "storyboard.json",
          project: "project.json",
          projectMd: "project.md",
          layoutSvg: "out/layout-preview.svg",
          assets: "assets",
          output: "out/video.mp4",
          ttsText: "text.txt",
        },
        render: { composition: "ComedyTextVideo" },
        processors: { asr: { runner: "uv", name: "funasr" }, tts },
      },
      null,
      2,
    )}\n`,
  );
  return root;
};

const defaultTts = () => ({
  runner: "uv",
  name: "qwen3-tts",
  env: {},
  options: {
    model: "Qwen/Qwen3-TTS-12Hz-0.6B-CustomVoice",
    language: "Chinese",
    speaker: "Vivian",
    device: "auto",
  },
});

test("default Qwen3-TTS capabilities report the selected configuration and local catalog", () => {
  const root = projectWithTts(defaultTts());
  const capabilities = synthesizeCapabilities(root);

  assert.deepEqual(capabilities.selected, {
    runner: "uv",
    processor: "qwen3-tts",
    model: "Qwen/Qwen3-TTS-12Hz-0.6B-CustomVoice",
    profile: "qwen3-custom-voice",
    language: "Chinese",
    speaker: "Vivian",
    device: "auto",
    modelSource: "modelscope",
  });
  assert.deepEqual(
    capabilities.available.models.map(({ model, profile }) => ({ model, profile })),
    [
      { model: "Qwen/Qwen3-TTS-12Hz-0.6B-CustomVoice", profile: "qwen3-custom-voice" },
      { model: "Qwen/Qwen3-TTS-12Hz-1.7B-CustomVoice", profile: "qwen3-custom-voice" },
      { model: "Qwen/Qwen3-TTS-12Hz-1.7B-VoiceDesign", profile: "qwen3-voice-design" },
      { model: "Qwen/Qwen3-TTS-12Hz-1.7B-Base", profile: "qwen3-base" },
    ],
  );
  assert.deepEqual(
    capabilities.available.voices.map(({ speaker, nativeLanguage }) => ({
      speaker,
      nativeLanguage,
    })),
    [
      { speaker: "Vivian", nativeLanguage: "中文（普通话）" },
      { speaker: "Serena", nativeLanguage: "中文（普通话）" },
      { speaker: "Uncle_Fu", nativeLanguage: "中文（普通话）" },
      { speaker: "Dylan", nativeLanguage: "中文（北京话）" },
      { speaker: "Eric", nativeLanguage: "中文（四川话）" },
      { speaker: "Ryan", nativeLanguage: "英语" },
      { speaker: "Aiden", nativeLanguage: "英语" },
      { speaker: "Ono_Anna", nativeLanguage: "日语" },
      { speaker: "Sohee", nativeLanguage: "韩语" },
    ],
  );
  assert.equal(capabilities.profile.execution, "native-batch");
  assert.deepEqual(capabilities.profile.controls, ["qwen-instruct"]);
  assert.equal(capabilities.profile.timing, "align");
  assert.deepEqual(capabilities.available.models[0].sources, [
    { provider: "modelscope", model: "Qwen/Qwen3-TTS-12Hz-0.6B-CustomVoice" },
    { provider: "huggingface", model: "Qwen/Qwen3-TTS-12Hz-0.6B-CustomVoice" },
  ]);
});

test("1.7B CustomVoice capabilities keep the configured model and speaker selected", () => {
  const root = projectWithTts(defaultTts());
  const configPath = join(root, "yumoframe.config.json");
  const config = json(configPath);
  config.processors.tts.options = {
    model: "Qwen/Qwen3-TTS-12Hz-1.7B-CustomVoice",
    language: "Chinese",
    speaker: "Serena",
    device: "mps",
  };
  writeFileSync(configPath, `${JSON.stringify(config, null, 2)}\n`);

  const capabilities = synthesizeCapabilities(root);
  assert.equal(capabilities.selected.model, "Qwen/Qwen3-TTS-12Hz-1.7B-CustomVoice");
  assert.equal(capabilities.selected.profile, "qwen3-custom-voice");
  assert.equal(capabilities.selected.speaker, "Serena");
  assert.equal(capabilities.selected.device, "mps");
  assert.ok(
    capabilities.available.models.some(({ model }) => model === capabilities.selected.model),
  );
  assert.ok(
    capabilities.available.voices.some(({ speaker }) => speaker === capabilities.selected.speaker),
  );
});

test("model names with text after a known suffix remain unknown", () => {
  const tts = defaultTts();
  tts.options.model = "Qwen/Qwen3-TTS-12Hz-1.7B-CustomVoice-preview";
  const capabilities = synthesizeCapabilities(projectWithTts(tts));

  assert.equal(capabilities.selected.profile, "unknown");
  assert.deepEqual(capabilities.profile, {
    id: "unknown",
    execution: "single",
    controls: ["none"],
    timing: "align",
  });
});

test("cached model paths match the repository name before snapshots", () => {
  const tts = defaultTts();
  tts.options.model = "/models/Qwen--Qwen3-TTS-12Hz-0.6B-CustomVoice/snapshots/main";

  assert.equal(synthesizeCapabilities(projectWithTts(tts)).selected.profile, "qwen3-custom-voice");
});

test("custom API capabilities expose no key, environment, endpoint, or private options", () => {
  const root = projectWithTts(defaultTts());
  const configPath = join(root, "yumoframe.config.json");
  const config = json(configPath);
  config.processors.tts = {
    runner: "api",
    provider: "custom-provider",
    baseUrl: "https://secret.example/speech?token=url-secret",
    model: "private-model",
    voice: "private-voice",
    apiKeyEnv: "YF_PRIVATE_KEY",
    options: { language: "Chinese", device: "cloud", apiKey: "inline-secret" },
  };
  writeFileSync(configPath, `${JSON.stringify(config, null, 2)}\n`);
  process.env.YF_PRIVATE_KEY = "environment-secret";
  try {
    const capabilities = synthesizeCapabilities(root);
    assert.deepEqual(capabilities.selected, {
      runner: "api",
      provider: "custom-provider",
      model: "private-model",
      profile: "unknown",
      language: "Chinese",
      voice: "private-voice",
      device: "cloud",
    });
    assert.equal(capabilities.available, undefined);
    assert.deepEqual(capabilities.profile, {
      id: "unknown",
      execution: "single",
      controls: ["none"],
      timing: "align",
    });
    const output = JSON.stringify(capabilities);
    for (const secret of [
      "YF_PRIVATE_KEY",
      "environment-secret",
      "inline-secret",
      "secret.example",
      "url-secret",
    ]) {
      assert.equal(output.includes(secret), false, `capabilities leaked ${secret}`);
    }
  } finally {
    delete process.env.YF_PRIVATE_KEY;
  }
});
