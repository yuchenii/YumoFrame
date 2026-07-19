import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import {
  chmodSync,
  existsSync,
  mkdtempSync,
  mkdirSync,
  readFileSync,
  symlinkSync,
  unlinkSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

import { findProjectRoot, loadConfig } from "../packages/cli/dist/core/config.js";
import { initProject } from "../packages/cli/dist/commands/init.js";
import {
  parseProject,
  renderLayoutSvg,
  resolveRotatingFlow,
  validateProject,
  validateStoryboard,
} from "../packages/templates/rotating-flow/adapter-dist/index.js";
import { resolveTemplate, templateInvocation } from "../packages/cli/dist/remotion/runtime.js";
import { transcribeInvocation } from "../packages/cli/dist/commands/transcribe.js";
import {
  synthesizeCapabilities,
  synthesizeInvocation,
  synthesizePlanInvocation,
  synthesizeProject,
} from "../packages/cli/dist/commands/synthesize.js";
import {
  apiSpeechBody,
  dashscopeSpeechBody,
  processorEnvironmentDir,
  runApiSpeech,
} from "../packages/cli/dist/media/processor-runtime.js";
import { subtitlesToTranscript } from "../packages/cli/dist/media/subtitles.js";
import { ejectProject } from "../packages/cli/dist/commands/eject.js";
import { doctorChecks, listTemplates } from "../packages/cli/dist/commands/doctor.js";
import { devProject } from "../packages/cli/dist/commands/dev.js";
import { renderProject } from "../packages/cli/dist/commands/render.js";
import { resolveProject } from "../packages/cli/dist/commands/resolve.js";
import { syncProject, syncProjectFiles } from "../packages/cli/dist/commands/sync.js";
import { validateCurrentProject } from "../packages/cli/dist/commands/validate.js";
import { parseConfig, parseTranscript } from "../packages/cli/dist/core/json.js";
import {
  parseSpeechPlan,
  resolveTtsProfile,
  validateSpeechPlan,
  validateTtsConfiguration,
} from "../packages/cli/dist/media/tts-plan.js";
import { formatTranscriptMd } from "../packages/cli/dist/media/transcript-md.js";
import {
  listTemplateManifests,
  loadTemplateContext,
  parseTemplateManifest,
} from "../packages/cli/dist/templates/registry.js";
import { inspectProject } from "../packages/cli/dist/commands/inspect.js";

const json = (path) => JSON.parse(readFileSync(path, "utf8"));
const testDir = dirname(fileURLToPath(import.meta.url));
const cliPath = join(testDir, "../packages/cli/dist/cli.js");
const packageVersion = json(join(testDir, "../package.json")).version;

async function withFakeMediaTools(root, callback) {
  const bin = join(root, "fake-media-bin");
  mkdirSync(bin);
  const ffmpeg = join(bin, "ffmpeg");
  const ffprobe = join(bin, "ffprobe");
  writeFileSync(
    ffmpeg,
    `#!/usr/bin/env node
import {readFileSync, writeFileSync} from 'node:fs';
const args = process.argv.slice(2);
const inputs = args.flatMap((arg, index) => arg === '-i' ? [args[index + 1]] : []).filter(Boolean);
const filter = args[args.indexOf('-filter_complex') + 1] || '';
const pauses = [...filter.matchAll(/anullsrc=[^;]*:d=([0-9.]+)/g)].reduce((sum, match) => sum + Number(match[1]), 0);
const duration = inputs.reduce((sum, path) => sum + JSON.parse(readFileSync(path, 'utf8')).duration, 0) + pauses;
writeFileSync(args.at(-1), JSON.stringify({duration}));
`,
  );
  writeFileSync(
    ffprobe,
    `#!/usr/bin/env node
import {readFileSync} from 'node:fs';
process.stdout.write(String(JSON.parse(readFileSync(process.argv.at(-1), 'utf8')).duration));
`,
  );
  chmodSync(ffmpeg, 0o755);
  chmodSync(ffprobe, 0o755);
  const previousPath = process.env.PATH;
  process.env.PATH = `${bin}:${previousPath ?? ""}`;
  try {
    return await callback();
  } finally {
    process.env.PATH = previousPath;
  }
}

test("Commander exposes detailed help and rejects invalid choices", () => {
  const version = spawnSync(process.execPath, [cliPath, "--version"], { encoding: "utf8" });
  assert.equal(version.status, 0, version.stderr);
  assert.equal(version.stdout.trim(), packageVersion);

  const empty = spawnSync(process.execPath, [cliPath], { encoding: "utf8" });
  assert.equal(empty.status, 0, empty.stderr);
  assert.match(empty.stdout, /Usage: yumoframe/);

  const help = spawnSync(process.execPath, [cliPath, "--help"], { encoding: "utf8" });
  assert.equal(help.status, 0, help.stderr);
  assert.match(help.stdout, /Typical workflows:/);
  assert.match(help.stdout, /studio\|dev/);

  const resolveHelp = spawnSync(process.execPath, [cliPath, "resolve", "--help"], {
    encoding: "utf8",
  });
  assert.equal(resolveHelp.status, 0, resolveHelp.stderr);
  assert.match(resolveHelp.stdout, /--no-align/);
  assert.match(resolveHelp.stdout, /transcript\.json/);

  const invalid = spawnSync(process.execPath, [cliPath, "sync", "unknown"], { encoding: "utf8" });
  assert.equal(invalid.status, 1);
  assert.match(invalid.stderr, /Allowed choices are all, transcript, project/);

  const templates = spawnSync(process.execPath, [cliPath, "templates", "--json"], {
    encoding: "utf8",
  });
  assert.equal(templates.status, 0, templates.stderr);
  assert.deepEqual(
    JSON.parse(templates.stdout).map((manifest) => manifest.id),
    ["rotating-flow", "center-line", "chat-bubbles"],
  );
});

test("JSON boundaries reject malformed external data", () => {
  assert.throws(() => parseConfig("{}"), /version must be a string/);
  assert.throws(() => parseTemplateManifest("{}"), /schemaVersion/);
  assert.throws(
    () => parseTranscript('{"segments":[{"start":"now","end":1,"text":"测试"}]}'),
    /needs numeric start\/end/,
  );

  const root = initProject({
    dir: join(mkdtempSync(join(tmpdir(), "yumoframe-json-")), "project"),
    template: "rotating-flow",
  });
  const config = json(join(root, "yumoframe.config.json"));
  config.processors.asr.runner = "unknown";
  assert.throws(() => parseConfig(JSON.stringify(config)), /runner must be uv, command, or api/);

  const project = json(join(root, "project.json"));
  project.timeline.virtualCanvas.width = "wide";
  assert.throws(
    () => parseProject(JSON.stringify(project)),
    /virtualCanvas.width must be a number/,
  );
});

test("init creates a data-only rotating-flow project", () => {
  const parent = mkdtempSync(join(tmpdir(), "yumoframe-init-"));
  const root = join(parent, "project-001");

  initProject({ dir: root, template: "rotating-flow" });

  assert.equal(json(join(root, "yumoframe.config.json")).template, "rotating-flow");
  assert.equal(json(join(root, "storyboard.json")).template, "rotating-flow");
  assert.ok(json(join(root, "storyboard.json")).scenes.length >= 1);
  assert.ok(json(join(root, "lines.json")).lines.length >= 1);
  assert.deepEqual(json(join(root, "project.json")).timeline.scenes, []);
  assert.equal(readFileSync(join(root, "assets", ".gitkeep"), "utf8"), "");
  assert.equal(findProjectRoot(join(root, "assets")), root);
  assert.equal(loadConfig(join(root, "assets")).config.paths.project, "project.json");
  assert.equal(loadConfig(root).config.paths.storyboard, "storyboard.json");
  assert.equal(loadConfig(root).config.paths.lines, "lines.json");
  assert.equal(loadConfig(root).config.paths.media, "assets/input.wav");
  assert.deepEqual(loadConfig(root).config.processors.tts, {
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
  assert.deepEqual(loadConfig(root).config.processors.align, {
    runner: "uv",
    name: "funasr",
    env: {},
    options: { model: "fa-zh", device: "auto" },
  });
});

test("init rejects unsupported templates and non-empty targets", () => {
  const parent = mkdtempSync(join(tmpdir(), "yumoframe-init-errors-"));
  assert.throws(
    () => initProject({ dir: join(parent, "bad"), template: "unknown-template" }),
    /Unsupported template/,
  );
  assert.throws(
    () => initProject({ dir: join(parent, "bad-preset"), template: "center-line", preset: "neon" }),
    /Unsupported preset/,
  );

  const occupied = join(parent, "occupied");
  mkdirSync(occupied);
  writeFileSync(join(occupied, "keep.txt"), "user data");
  assert.throws(() => initProject({ dir: occupied, template: "rotating-flow" }), /not empty/);
});

test("center-line presets resolve the same flat Storyboard with different styles", () => {
  const root = initProject({
    dir: join(mkdtempSync(join(tmpdir(), "yumoframe-center-line-")), "project"),
    template: "center-line",
  });
  const configPath = join(root, "yumoframe.config.json");
  const storyboard = json(join(root, "storyboard.json"));
  assert.equal(json(configPath).preset, "minimal-dark");
  assert.equal(Array.isArray(storyboard.lines), true);
  assert.equal("scenes" in storyboard, false);
  assert.equal(existsSync(join(root, "lines.json")), false);

  storyboard.style = { fontSize: 92 };
  writeFileSync(join(root, "storyboard.json"), `${JSON.stringify(storyboard, null, 2)}\n`);

  const minimal = resolveProject(root, { align: false }).project;
  assert.equal(minimal.preset, "minimal-dark");
  assert.equal(minimal.style.historyLines, 0);
  assert.equal(minimal.style.fontSize, 92);
  const config = json(configPath);
  config.preset = "echo";
  writeFileSync(configPath, `${JSON.stringify(config, null, 2)}\n`);
  const echo = resolveProject(root, { align: false }).project;
  assert.equal(echo.preset, "echo");
  assert.equal(echo.style.historyLines, 4);
  assert.equal(echo.style.fontSize, 92);
  assert.deepEqual(echo.lines, minimal.lines);
  assert.equal(inspectProject(root).template.preset.id, "echo");
  assert.deepEqual(validateCurrentProject(root), []);
});

test("center-line derives media timing from transcript.json", () => {
  const root = initProject({
    dir: join(mkdtempSync(join(tmpdir(), "yumoframe-center-align-")), "project"),
    template: "center-line",
  });
  writeFileSync(
    join(root, "storyboard.json"),
    `${JSON.stringify(
      {
        version: "0.1.0",
        template: "center-line",
        lines: [{ id: "line-001", text: "第一句话", emphasis: ["第一句"] }],
      },
      null,
      2,
    )}\n`,
  );
  writeFileSync(
    join(root, "transcript.json"),
    `${JSON.stringify(
      {
        duration: 2.4,
        segments: [{ start: 0.2, end: 1.4, text: "第一句话" }],
      },
      null,
      2,
    )}\n`,
  );
  const result = resolveProject(root);
  assert.equal(result.aligned, true);
  assert.deepEqual(result.project.lines[0], {
    id: "line-001",
    text: "第一句话",
    emphasis: ["第一句"],
    start: 0.2,
    end: 1.4,
  });
  assert.equal(result.project.composition.duration, 2.4);
});

test("sync all skips project Markdown for templates without it", () => {
  const root = initProject({
    dir: join(mkdtempSync(join(tmpdir(), "yumoframe-sync-skip-")), "project"),
    template: "center-line",
  });
  const transcript = {
    duration: 1.4,
    segments: [{ start: 0.2, end: 1.4, text: "第一句话", timestamp: [[200, 1400]] }],
  };
  writeFileSync(join(root, "transcript.json"), `${JSON.stringify(transcript, null, 2)}\n`);
  writeFileSync(
    join(root, "transcript.md"),
    formatTranscriptMd({
      segments: transcript.segments.map((segment) => ({ ...segment, cleaned: segment.text })),
    }),
  );

  const results = syncProjectFiles(root, ["all"]);
  assert.equal(results.transcript?.segments, 1);
  assert.equal(results.project, undefined);
  assert.match(results.skippedProject ?? "", /does not support project Markdown sync/);
  assert.throws(
    () => syncProjectFiles(root, ["project"]),
    /does not support project Markdown sync/,
  );
  assert.throws(() => syncProject(root), /does not support project Markdown sync/);
});

test("resolve CLI omits undefined optional output paths", () => {
  const root = initProject({
    dir: join(mkdtempSync(join(tmpdir(), "yumoframe-resolve-log-")), "project"),
    template: "center-line",
  });
  const result = spawnSync(process.execPath, [cliPath, "resolve", "--no-align"], {
    cwd: root,
    encoding: "utf8",
  });
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /Resolved /);
  assert.match(result.stdout, /Wrote .*storyboard\.json/);
  assert.doesNotMatch(result.stdout, /Wrote undefined/);
  assert.doesNotMatch(result.stdout, /project\.md/);
});

test("center-line validation reports malformed external line data without crashing", () => {
  const root = initProject({
    dir: join(mkdtempSync(join(tmpdir(), "yumoframe-center-invalid-")), "project"),
    template: "center-line",
  });
  writeFileSync(
    join(root, "storyboard.json"),
    `${JSON.stringify(
      {
        version: "0.1.0",
        template: "center-line",
        lines: [{ id: "line-001", text: 42, emphasis: ["bad"], start: 1 }],
      },
      null,
      2,
    )}\n`,
  );
  const errors = validateCurrentProject(root);
  assert.ok(errors.some((error) => error.includes("text must be non-empty")));
  assert.ok(errors.some((error) => error.includes("needs both start and end")));

  writeFileSync(
    join(root, "project.json"),
    `${JSON.stringify(
      {
        version: "0.1.0",
        template: "center-line",
        preset: "minimal-dark",
        composition: { width: 1080, height: 1920, fps: 30, duration: 1, background: "#000" },
        style: { fontSize: 100, historyLines: 0, echoOpacity: 0 },
        lines: [null],
      },
      null,
      2,
    )}\n`,
  );
  assert.ok(
    validateCurrentProject(root).some((error) =>
      error.includes("project lines must have positive numeric timing"),
    ),
  );
});

test("center-line text-only resolve rejects missing timing", () => {
  const root = initProject({
    dir: join(mkdtempSync(join(tmpdir(), "yumoframe-center-timing-")), "project"),
    template: "center-line",
  });
  writeFileSync(
    join(root, "storyboard.json"),
    `${JSON.stringify(
      {
        version: "0.1.0",
        template: "center-line",
        lines: [{ id: "line-001", text: "没有时间" }],
      },
      null,
      2,
    )}\n`,
  );
  assert.throws(() => resolveProject(root, { align: false }), /needs numeric start\/end/);
});

test("chat-bubbles resolves participants, text timing, layout, and scrolling", () => {
  const root = initProject({
    dir: join(mkdtempSync(join(tmpdir(), "yumoframe-chat-")), "project"),
    template: "chat-bubbles",
  });
  assert.deepEqual(validateCurrentProject(root), []);
  const storyboardPath = join(root, "storyboard.json");
  const storyboard = {
    version: "0.1.0",
    template: "chat-bubbles",
    participants: [
      { id: "friend", name: "朋友", side: "left", avatar: "assets/friend.png" },
      { id: "me", name: "我", side: "right" },
    ],
    messages: Array.from({ length: 7 }, (_, index) => ({
      id: `message-${index + 1}`,
      speaker: index % 2 ? "me" : "friend",
      type: "text",
      text: `消息${index + 1}`,
      durationMs: 1000,
      pauseAfterMs: 200,
    })),
  };
  writeFileSync(join(root, "assets", "friend.png"), "avatar");
  writeFileSync(storyboardPath, `${JSON.stringify(storyboard, null, 2)}\n`);

  const result = resolveProject(root, { align: false });
  assert.equal(result.project.template, "chat-bubbles");
  assert.equal(result.project.messages.length, 7);
  assert.equal(result.project.messages[0].side, "left");
  assert.equal(result.project.messages[1].side, "right");
  assert.equal(result.project.messages[1].start, 1.2);
  assert.equal(result.project.messages[6].layout.scrollOffset, 184);
  assert.equal(result.project.scrollStates.at(-1).offset, 184);
  assert.equal("scenes" in result.project, false);
  assert.deepEqual(json(storyboardPath), storyboard);
  assert.deepEqual(validateCurrentProject(root), []);
});

test("chat-bubbles aligns message text from transcript timing", () => {
  const root = initProject({
    dir: join(mkdtempSync(join(tmpdir(), "yumoframe-chat-align-")), "project"),
    template: "chat-bubbles",
  });
  writeFileSync(
    join(root, "storyboard.json"),
    `${JSON.stringify(
      {
        version: "0.1.0",
        template: "chat-bubbles",
        participants: [
          { id: "a", name: "甲", side: "left" },
          { id: "b", name: "乙", side: "right" },
        ],
        messages: [
          { id: "message-001", speaker: "a", type: "text", text: "你好" },
          { id: "message-002", speaker: "b", type: "text", text: "马上到" },
        ],
      },
      null,
      2,
    )}\n`,
  );
  writeFileSync(
    join(root, "transcript.json"),
    `${JSON.stringify(
      {
        duration: 3.2,
        segments: [
          { start: 0.3, end: 1.1, text: "你好" },
          { start: 1.8, end: 2.7, text: "马上到" },
        ],
      },
      null,
      2,
    )}\n`,
  );
  const result = resolveProject(root);
  assert.equal(result.aligned, true);
  assert.deepEqual(
    result.project.messages.map(({ start, end }) => ({ start, end })),
    [
      { start: 0.3, end: 1.1 },
      { start: 1.8, end: 2.7 },
    ],
  );
  assert.equal(result.project.composition.duration, 3.7);
});

test("chat-bubbles rejects invalid references, assets, and non-text messages", () => {
  const root = initProject({
    dir: join(mkdtempSync(join(tmpdir(), "yumoframe-chat-invalid-")), "project"),
    template: "chat-bubbles",
  });
  writeFileSync(
    join(root, "storyboard.json"),
    `${JSON.stringify(
      {
        version: "0.1.0",
        template: "chat-bubbles",
        participants: [{ id: "me", name: "我", side: "right", avatar: "assets/missing.png" }],
        messages: [{ id: "message-001", speaker: "nobody", type: "image", text: "nope" }],
      },
      null,
      2,
    )}\n`,
  );
  const errors = validateCurrentProject(root);
  assert.ok(errors.some((error) => error.includes("speaker must reference a participant")));
  assert.ok(errors.some((error) => error.includes("only supports text")));
  assert.ok(errors.some((error) => error.includes("avatar not found")));
});

test("validate checks lines.json even when storyboard.json exists", () => {
  const root = initProject({
    dir: join(mkdtempSync(join(tmpdir(), "yumoframe-lines-")), "project"),
    template: "rotating-flow",
  });
  const linesPath = join(root, "lines.json");
  const lines = json(linesPath);
  lines.lines[0].segments[0].text = "超过六个中文字";
  writeFileSync(linesPath, `${JSON.stringify(lines, null, 2)}\n`);

  assert.ok(
    validateCurrentProject(root).some(
      (error) => error.includes("lines[0]") && error.includes("max 6"),
    ),
  );
});

test("studio and render stop on validation errors before starting Remotion", () => {
  const root = initProject({
    dir: join(mkdtempSync(join(tmpdir(), "yumoframe-preflight-")), "project"),
    template: "rotating-flow",
  });
  const linesPath = join(root, "lines.json");
  const lines = json(linesPath);
  lines.lines[0].segments[0].text = "超过六个中文字";
  writeFileSync(linesPath, `${JSON.stringify(lines, null, 2)}\n`);

  assert.throws(() => devProject(root), /lines\[0\].*max 6/);
  assert.throws(() => renderProject(root), /lines\[0\].*max 6/);
});

test("studio and render require resolved project scenes", () => {
  const parent = mkdtempSync(join(tmpdir(), "yumoframe-resolved-preflight-"));
  const emptyRoot = initProject({ dir: join(parent, "empty"), template: "rotating-flow" });
  assert.throws(() => devProject(emptyRoot), /project\.json has no resolved scenes/);

  const missingRoot = initProject({ dir: join(parent, "missing"), template: "rotating-flow" });
  unlinkSync(join(missingRoot, "project.json"));
  assert.throws(() => renderProject(missingRoot), /missing project\.json/);
});

test("config discovery reports a project outside any config tree", () => {
  const outside = mkdtempSync(join(tmpdir(), "yumoframe-no-config-"));
  assert.throws(() => findProjectRoot(outside), /yumoframe.config.json/);
});

const storyboard = {
  version: "0.1.0",
  template: "rotating-flow",
  duration: 8,
  scenes: [
    {
      lines: [
        { start: 0, end: 1, segments: [{ text: "第一句", highlight: false }] },
        { start: 1, end: 2, segments: [{ text: "第二句", highlight: false }] },
        { start: 2, end: 3, segments: [{ text: "第三句", highlight: false }] },
      ],
    },
    {
      lines: [
        { start: 3.6, end: 4.5, segments: [{ text: "第四句", highlight: false }] },
        { start: 4.5, end: 5.5, segments: [{ text: "第五句", highlight: false }] },
        { start: 5.5, end: 6.5, segments: [{ text: "第六句", highlight: false }] },
      ],
    },
  ],
};

test("resolve uses scenes tree and alternates rotation", () => {
  const project = resolveRotatingFlow(storyboard, {
    render: { width: 1080, height: 1920, fps: 30 },
  });
  assert.equal(project.timeline.scenes.length, 2);
  assert.deepEqual(
    project.timeline.scenes.map((scene) => scene.camera.rotate),
    [0, -90],
  );
  assert.deepEqual(
    project.timeline.scenes.map((scene) => scene.elements[0].lines.length),
    [3, 3],
  );
  assert.ok(project.timeline.scenes[0].elements[0].width > 0);
  assert.ok(project.timeline.scenes[0].camera.targetX > 0);
});

test("storyboard validation reports timing, length, and highlight errors together", () => {
  const errors = validateStoryboard({
    version: "0.1.0",
    template: "rotating-flow",
    scenes: [
      {
        lines: [
          { start: 1, end: 2, segments: [{ text: "超过六个中文字", highlight: true }] },
          { start: 1.5, end: 1.5, segments: [{ text: "错误", highlight: true }] },
        ],
      },
    ],
  });
  assert.ok(errors.some((error) => error.includes("units") && error.includes("max 6")));
  assert.ok(errors.some((error) => error.includes("previous line")));
  assert.ok(errors.some((error) => error.includes("after start")));
  assert.ok(errors.some((error) => error.includes("35%")));
});

test("project validation checks referenced project assets", () => {
  const root = mkdtempSync(join(tmpdir(), "yumoframe-project-validation-"));
  const project = resolveRotatingFlow(
    { ...storyboard, audio: { src: "assets/voice.m4a" } },
    {
      render: { width: 1080, height: 1920, fps: 30 },
    },
  );
  assert.ok(validateProject(project, root).some((error) => error.includes("file missing")));
});

test("runtime template is package-relative and local template is project-relative", () => {
  const projectRoot = "/tmp/yumoframe-project";
  assert.match(
    resolveTemplate({ template: "rotating-flow", templateSource: "runtime" }, projectRoot),
    /packages\/templates\/rotating-flow$/,
  );
  assert.equal(
    resolveTemplate(
      { template: "rotating-flow", templateSource: "local", templatePath: "templates/custom-flow" },
      projectRoot,
    ),
    "/tmp/yumoframe-project/templates/custom-flow",
  );
  assert.equal(
    resolveTemplate(
      {
        template: "rotating-flow",
        templateSource: "local",
        templatePath: "templates/rotating-flow",
      },
      projectRoot,
    ),
    "/tmp/yumoframe-project/templates/rotating-flow",
  );
});

test("render invocation uses the configured project and output", () => {
  const invocation = templateInvocation("render", {
    projectRoot: "/tmp/project",
    templateDir: "/tmp/template",
    entry: "src/custom.tsx",
    composition: "ComedyTextVideo",
    output: "/tmp/project/out/video.mp4",
    projectFile: "/tmp/project/project.json",
    remotionCli: "/tmp/node_modules/@remotion/cli/remotion-cli.js",
    dependencyNodeModules: "/tmp/node_modules",
  });
  assert.deepEqual(invocation.args.slice(1, 5), [
    "render",
    "src/custom.tsx",
    "ComedyTextVideo",
    "/tmp/project/out/video.mp4",
  ]);
  assert.equal(invocation.cwd, "/tmp/template");
  assert.equal(invocation.env.YUMOFRAME_PROJECT, "/tmp/project");
  assert.equal(
    invocation.args[invocation.args.indexOf("--props") + 1],
    "/tmp/project/project.json",
  );
});

test("layout SVG fits its viewBox to positioned content instead of the virtual canvas", () => {
  const project = {
    version: "0.1.0",
    template: "rotating-flow",
    composition: { width: 1080, height: 1920, fps: 30, duration: 2, background: "#000000" },
    source: { type: "text", text: "字" },
    theme: { fontFamily: "system-ui", textColor: "#fff", highlightColor: "#0f0" },
    timeline: {
      virtualCanvas: { width: 40000, height: 40000 },
      scenes: [
        {
          id: "scene-001",
          start: 0,
          end: 1,
          camera: { targetX: 1060, targetY: 1259, scale: 1, rotate: 0, ease: "spring" },
          elements: [
            {
              id: "text-001",
              type: "kinetic-text",
              x: 1000,
              y: 1200,
              width: 120,
              rotate: 0,
              scale: 1,
              fontSize: 100,
              lineHeight: 1,
              align: "right",
              lines: [{ start: 0, end: 1, segments: [{ text: "字", highlight: false }] }],
            },
          ],
        },
      ],
    },
  };

  const svg = renderLayoutSvg(project);
  assert.match(svg, /width="520" height="518" viewBox="800 1000 520 518"/);
  assert.match(svg, /translate\(1000\.0 1200\.0\)/);
});

test("end overview centers and contains all content", async () => {
  const originalOffscreenCanvas = globalThis.OffscreenCanvas;
  globalThis.OffscreenCanvas = class {
    getContext() {
      return {
        font: "100px system-ui",
        measureText(text) {
          const size = Number.parseFloat(this.font.match(/([\d.]+)px/)?.[1] ?? "100");
          return { width: [...text].length * size };
        },
      };
    }
  };
  const { createServer } = await import("vite");
  const templateRoot = join(
    dirname(fileURLToPath(import.meta.url)),
    "../packages/templates/rotating-flow",
  );
  const server = await createServer({
    root: templateRoot,
    logLevel: "silent",
    server: { middlewareMode: true },
    appType: "custom",
  });
  try {
    const { getCamera } = await server.ssrLoadModule("/src/lib/camera.ts");
    const line = (text, start, end) => ({
      fontSize: 100,
      start,
      end,
      segments: [{ text, highlight: false }],
    });
    const element = (id, x, y, text, start, end) => ({
      id,
      type: "kinetic-text",
      x,
      y,
      width: 200,
      rotate: 0,
      scale: 1,
      fontSize: 100,
      lineHeight: 1,
      align: "left",
      lines: [line(text, start, end)],
    });
    const project = {
      version: "0.1.0",
      template: "rotating-flow",
      endOverview: true,
      composition: { width: 1000, height: 1000, fps: 30, duration: 4, background: "#000" },
      source: { type: "text", text: "甲乙" },
      theme: {
        fontFamily: "system-ui",
        textColor: "#fff",
        highlightColor: "#0f0",
        cursorColor: "#fff",
        dimCursorColor: "#777",
      },
      timeline: {
        virtualCanvas: { width: 40000, height: 40000 },
        scenes: [
          {
            id: "s1",
            start: 0,
            end: 1,
            camera: { targetX: 200, targetY: 250, scale: 1, rotate: 0, ease: "spring" },
            elements: [element("e1", 100, 200, "甲", 0, 1)],
          },
          {
            id: "s2",
            start: 1,
            end: 2,
            camera: { targetX: 1000, targetY: 650, scale: 1, rotate: 0, ease: "spring" },
            elements: [element("e2", 900, 600, "乙", 1, 2)],
          },
        ],
      },
    };

    const camera = getCamera(project, project.timeline.scenes[1], 102, 30);
    const overviewStartCamera = getCamera(project, project.timeline.scenes[1], 70.5, 30);
    const earlyOverviewCamera = getCamera(project, project.timeline.scenes[1], 76.5, 30);
    const screen = (activeCamera, x, y) => ({
      x: project.composition.width / 2 + activeCamera.scale * (x - activeCamera.targetX),
      y: project.composition.height / 2 + activeCamera.scale * (y - activeCamera.targetY),
    });
    const topLeft = screen(camera, 100, 200);
    const bottomRight = screen(camera, 1100, 700);

    assert.ok(Math.abs((topLeft.x + bottomRight.x) / 2 - 500) < 0.001);
    assert.ok(Math.abs((topLeft.y + bottomRight.y) / 2 - 500) < 0.001);
    assert.ok(topLeft.x >= 96 && bottomRight.x <= 904);
    assert.ok(topLeft.y >= 96 && bottomRight.y <= 904);

    const zoomProgress =
      (overviewStartCamera.scale - earlyOverviewCamera.scale) /
      (overviewStartCamera.scale - camera.scale);
    const overviewCenter = { x: 600, y: 450 };
    const startCenter = screen(overviewStartCamera, overviewCenter.x, overviewCenter.y);
    const earlyCenter = screen(earlyOverviewCamera, overviewCenter.x, overviewCenter.y);
    const finalCenter = screen(camera, overviewCenter.x, overviewCenter.y);
    const moved = Math.hypot(earlyCenter.x - startCenter.x, earlyCenter.y - startCenter.y);
    const totalMove = Math.hypot(finalCenter.x - startCenter.x, finalCenter.y - startCenter.y);
    assert.ok(zoomProgress > 0.45, "overview should start zooming out immediately");
    assert.ok(
      Math.abs(moved / totalMove - zoomProgress) < 0.001,
      "overview should center in sync with its zoom",
    );
  } finally {
    await server.close();
    globalThis.OffscreenCanvas = originalOffscreenCanvas;
  }
});

test("FunASR uses a versioned virtual environment outside the package", () => {
  const environment = processorEnvironmentDir("funasr", "0.1.0");
  assert.equal(environment.endsWith(join("yumoframe", "venvs", "funasr", "0.1.0")), true);
  assert.equal(environment.includes(join("processors")), false);

  const invocation = transcribeInvocation({
    root: "/tmp/project",
    config: {
      runtimeVersion: "0.1.0",
      paths: { media: "assets/input.mp4", transcript: "transcript.json" },
      processors: {
        asr: {
          runner: "uv",
          name: "funasr",
          options: { device: "cpu", hotwords: "复读 20", maxSegmentMs: 12000 },
        },
      },
    },
    outputBase: "/tmp/project/.transcript-tmp",
  });
  assert.equal(invocation.command, "uv");
  assert.equal(invocation.env.UV_PROJECT_ENVIRONMENT, environment);
  assert.ok(invocation.args.includes("--locked"));
  assert.ok(invocation.args.includes("12000"));
});

test("Qwen3-TTS uses the bundled uv processor with 0.6B Vivian defaults", () => {
  const config = {
    runtimeVersion: "0.1.1",
    processors: {
      asr: { runner: "uv", name: "funasr" },
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
    },
  };
  const invocation = synthesizeInvocation({ config, text: "大家好", outPath: "/tmp/voice.wav" });

  assert.equal(invocation.command, "uv");
  assert.equal(
    invocation.env.UV_PROJECT_ENVIRONMENT,
    processorEnvironmentDir("qwen3-tts", "0.1.1"),
  );
  assert.ok(invocation.args.includes("--locked"));
  assert.ok(invocation.args.some((arg) => arg.endsWith("/processors/qwen3-tts")));
  assert.deepEqual(invocation.args.slice(4, 9), [
    "qwen3-tts",
    "--text",
    "大家好",
    "--output",
    "/tmp/voice.wav",
  ]);
  assert.ok(invocation.args.includes("Qwen/Qwen3-TTS-12Hz-0.6B-CustomVoice"));
  assert.ok(invocation.args.includes("Vivian"));

  config.processors.tts.options = {
    model: "Qwen/Qwen3-TTS-12Hz-1.7B-Base",
    language: "Chinese",
    refAudio: "assets/reference.wav",
    refText: "参考音频里的文字",
  };
  const cloneInvocation = synthesizeInvocation({
    config,
    text: "大家好",
    outPath: "/tmp/voice.wav",
    root: "/tmp/project",
  });
  assert.ok(cloneInvocation.args.includes("/tmp/project/assets/reference.wav"));

  const planInvocation = synthesizePlanInvocation({
    config,
    planPath: "/tmp/project/speech.json",
    outputDir: "/tmp/project/parts",
    root: "/tmp/project",
  });
  assert.deepEqual(planInvocation.args.slice(4, 9), [
    "qwen3-tts",
    "--plan",
    "/tmp/project/speech.json",
    "--output-dir",
    "/tmp/project/parts",
  ]);
});

test("VoiceDesign whole-text requirements fail before starting uv", async () => {
  const root = initProject({
    dir: join(mkdtempSync(join(tmpdir(), "yumoframe-voice-design-")), "project"),
    template: "rotating-flow",
  });
  const configPath = join(root, "yumoframe.config.json");
  const config = json(configPath);
  config.processors.tts = {
    runner: "uv",
    name: "qwen3-tts",
    uvBin: join(root, "must-not-run"),
    options: { model: "Qwen/Qwen3-TTS-12Hz-1.7B-VoiceDesign", language: "Chinese" },
  };
  writeFileSync(configPath, `${JSON.stringify(config, null, 2)}\n`);

  await assert.rejects(
    synthesizeProject({ text: "你好", start: root }),
    /requires non-empty processors\.tts\.options\.instruct/,
  );
});

test("speech plans validate against the active profile before merging and alignment", async () => {
  const root = initProject({
    dir: join(mkdtempSync(join(tmpdir(), "yumoframe-speech-plan-")), "project"),
    template: "rotating-flow",
  });
  const fakeTts = join(root, "fake-tts.mjs");
  const fakeAlign = join(root, "fake-align.mjs");
  const calls = join(root, "tts-calls.txt");
  writeFileSync(
    fakeTts,
    `
import {appendFileSync, writeFileSync} from 'node:fs';
const out = process.argv[2];
const samples = 2400;
const wav = Buffer.alloc(44 + samples * 2);
wav.write('RIFF', 0); wav.writeUInt32LE(36 + samples * 2, 4); wav.write('WAVE', 8);
wav.write('fmt ', 12); wav.writeUInt32LE(16, 16); wav.writeUInt16LE(1, 20); wav.writeUInt16LE(1, 22);
wav.writeUInt32LE(24000, 24); wav.writeUInt32LE(48000, 28); wav.writeUInt16LE(2, 32); wav.writeUInt16LE(16, 34);
wav.write('data', 36); wav.writeUInt32LE(samples * 2, 40);
writeFileSync(out, wav); appendFileSync(process.argv[3], out + '\\n');
`,
  );
  writeFileSync(
    fakeAlign,
    `
import {readFileSync, writeFileSync} from 'node:fs';
const manifest = JSON.parse(readFileSync(process.argv[process.argv.indexOf('--align-manifest') + 1], 'utf8'));
const output = process.argv[process.argv.indexOf('-o') + 1];
writeFileSync(output + '.json', JSON.stringify({version: 1, items: manifest.items.map((item) => ({
  id: item.id, valid: true, issues: [], transcript: {
    engine: 'fake-fa', language: 'zh', duration: 0.1,
    segments: [{start: 0, end: 0.1, text: item.text, timestamp: [[0, 33], [33, 66], [66, 100]]}],
  },
}))}));
`,
  );
  const configPath = join(root, "yumoframe.config.json");
  const config = json(configPath);
  config.processors.tts = {
    runner: "command",
    profile: "edge-tts",
    command: [process.execPath, fakeTts, "{out}", calls],
  };
  config.processors.align = { runner: "command", command: [process.execPath, fakeAlign] };
  writeFileSync(configPath, `${JSON.stringify(config, null, 2)}\n`);
  writeFileSync(join(root, "text.txt"), "第一句。第二句！");
  const planPath = join(root, "speech.json");
  const plan = {
    version: "0.1.0",
    source: "text.txt",
    segments: [
      {
        id: "s1",
        text: "第一句。",
        intent: { emotion: "calm", intensity: 0.2, pace: "normal" },
        control: { type: "qwen-instruct", instruct: "平静" },
        pauseAfterMs: 100,
      },
      {
        id: "s2",
        text: "第二句！",
        intent: { emotion: "surprised", intensity: 0.8, pace: "fast" },
        control: { type: "qwen-instruct", instruct: "惊讶" },
        pauseAfterMs: 0,
      },
    ],
  };
  writeFileSync(planPath, `${JSON.stringify(plan, null, 2)}\n`);

  assert.equal(synthesizeCapabilities(root).profile.id, "edge-tts");
  plan.source = "other.txt";
  writeFileSync(planPath, `${JSON.stringify(plan, null, 2)}\n`);
  await assert.rejects(
    synthesizeProject({ plan: "speech.json", start: root }),
    /source must reference the configured TTS text/,
  );
  assert.equal(existsSync(calls), false);
  plan.source = "text.txt";
  writeFileSync(planPath, `${JSON.stringify(plan, null, 2)}\n`);
  await assert.rejects(
    synthesizeProject({ plan: "speech.json", start: root }),
    /uses qwen-instruct.*accepts edge-prosody/,
  );
  assert.equal(existsSync(calls), false);

  plan.segments[0].control = { type: "edge-prosody", rate: "+0%", pitch: "+0Hz", volume: "+0%" };
  plan.segments[1].control = { type: "edge-prosody", rate: "+15%", pitch: "+5Hz", volume: "+0%" };
  writeFileSync(planPath, `${JSON.stringify(plan, null, 2)}\n`);
  const result = await synthesizeProject({ plan: "speech.json", start: root });
  assert.equal(readFileSync(calls, "utf8").trim().split("\n").length, 2);
  assert.ok(readFileSync(result.outputPath).length > 44);
  assert.equal(
    json(result.transcriptPath)
      .segments.map((segment) => segment.text)
      .join(""),
    "第一句。第二句！",
  );
});

test("fragment alignment offsets transcripts by fragment duration and planned pauses", async () => {
  const root = initProject({
    dir: join(mkdtempSync(join(tmpdir(), "yumoframe-fragment-timing-")), "project"),
    template: "rotating-flow",
  });
  const fakeTts = join(root, "fake-tts.mjs");
  const fakeAlign = join(root, "fake-align.mjs");
  writeFileSync(
    fakeTts,
    `
import {writeFileSync} from 'node:fs';
writeFileSync(process.argv[2], JSON.stringify({duration: process.argv[3] === '甲' ? 1 : 2}));
`,
  );
  writeFileSync(
    fakeAlign,
    `
import {readFileSync, writeFileSync} from 'node:fs';
import {isAbsolute} from 'node:path';
const manifest = JSON.parse(readFileSync(process.argv[process.argv.indexOf('--align-manifest') + 1], 'utf8'));
if (manifest.items.some((item) => isAbsolute(item.audio))) throw new Error('manifest audio must be relative');
const output = process.argv[process.argv.indexOf('-o') + 1];
const timing = {s1: [1, 0, 0.8], s2: [2, 0.1, 1.9]};
writeFileSync(output + '.json', JSON.stringify({version: 1, items: manifest.items.map((item) => {
  const [duration, start, end] = timing[item.id];
  return {id: item.id, valid: true, issues: [], transcript: {
    engine: 'fake-fa', language: 'zh', duration,
    segments: [{start, end, text: item.text, timestamp: [[start * 1000, end * 1000]]}],
  }};
})}));
`,
  );
  const configPath = join(root, "yumoframe.config.json");
  const config = json(configPath);
  config.processors.tts = {
    runner: "command",
    profile: "edge-tts",
    command: [process.execPath, fakeTts, "{out}", "{text}"],
  };
  config.processors.align = { runner: "command", command: [process.execPath, fakeAlign] };
  config.processors.asr = { runner: "command", command: [join(root, "must-not-run")] };
  writeFileSync(configPath, `${JSON.stringify(config, null, 2)}\n`);
  writeFileSync(join(root, "text.txt"), "甲乙");
  writeFileSync(
    join(root, "speech.json"),
    `${JSON.stringify(
      {
        version: "0.1.0",
        source: "text.txt",
        segments: [
          {
            id: "s1",
            text: "甲",
            intent: { emotion: "neutral", intensity: 0, pace: "normal" },
            control: { type: "edge-prosody", rate: "+0%", pitch: "+0Hz", volume: "+0%" },
            pauseAfterMs: 250,
          },
          {
            id: "s2",
            text: "乙",
            intent: { emotion: "neutral", intensity: 0, pace: "normal" },
            control: { type: "edge-prosody", rate: "+0%", pitch: "+0Hz", volume: "+0%" },
            pauseAfterMs: 0,
          },
        ],
      },
      null,
      2,
    )}\n`,
  );

  await withFakeMediaTools(root, async () => {
    const result = await synthesizeProject({ plan: "speech.json", start: root });
    const transcript = json(result.transcriptPath);
    assert.deepEqual(
      transcript.segments.map(({ start, end, timestamp }) => [start, end, timestamp]),
      [
        [0, 0.8, [[0, 800]]],
        [1.35, 3.15, [[1350, 3150]]],
      ],
    );
    assert.equal(transcript.duration, 3.25);
    assert.equal(result.timingMode, "fragment-align");
    assert.equal(result.duration, 3.25);
    assert.equal(result.lastTimestamp, 3.15);
  });
});

test("one invalid fragment falls back once to final-audio ASR without mixing timings", async () => {
  const root = initProject({
    dir: join(mkdtempSync(join(tmpdir(), "yumoframe-fragment-fallback-")), "project"),
    template: "rotating-flow",
  });
  const fakeTts = join(root, "fake-tts.mjs");
  const fakeAlign = join(root, "fake-align.mjs");
  const fakeAsr = join(root, "fake-asr.mjs");
  const asrCalls = join(root, "asr-calls.jsonl");
  writeFileSync(
    fakeTts,
    `import {writeFileSync} from 'node:fs'; writeFileSync(process.argv[2], JSON.stringify({duration: 1}));\n`,
  );
  writeFileSync(
    fakeAlign,
    `
import {readFileSync, writeFileSync} from 'node:fs';
const manifest = JSON.parse(readFileSync(process.argv[process.argv.indexOf('--align-manifest') + 1], 'utf8'));
const output = process.argv[process.argv.indexOf('-o') + 1];
writeFileSync(output + '.json', JSON.stringify({version: 1, items: manifest.items.map((item, index) => ({
  id: item.id, valid: index === 0, issues: index === 0 ? [] : ['missing-timestamps'],
  transcript: {engine: 'fake-fa', language: 'zh', duration: 1, segments: [{start: 0, end: 0.8, text: item.text, timestamp: [[0, 800]]}]},
}))}));
`,
  );
  writeFileSync(
    fakeAsr,
    `
import {appendFileSync, readFileSync, writeFileSync} from 'node:fs';
const media = process.argv[3];
const output = process.argv[4];
appendFileSync(process.argv[2], JSON.stringify({media, duration: JSON.parse(readFileSync(media, 'utf8')).duration}) + '\\n');
writeFileSync(output + '.json', JSON.stringify({engine: 'fake-asr', language: 'zh', duration: 2.1, segments: [{start: 0.2, end: 1.9, text: '实际朗读', timestamp: [[200, 1900]]}]}));
`,
  );
  const configPath = join(root, "yumoframe.config.json");
  const config = json(configPath);
  config.processors.tts = {
    runner: "command",
    profile: "edge-tts",
    command: [process.execPath, fakeTts, "{out}"],
  };
  config.processors.align = { runner: "command", command: [process.execPath, fakeAlign] };
  config.processors.asr = { runner: "command", command: [process.execPath, fakeAsr, asrCalls] };
  writeFileSync(configPath, `${JSON.stringify(config, null, 2)}\n`);
  writeFileSync(join(root, "text.txt"), "甲乙");
  writeFileSync(
    join(root, "speech.json"),
    `${JSON.stringify(
      {
        version: "0.1.0",
        source: "text.txt",
        segments: [
          {
            id: "s1",
            text: "甲",
            intent: { emotion: "neutral", intensity: 0, pace: "normal" },
            control: { type: "edge-prosody", rate: "+0%", pitch: "+0Hz", volume: "+0%" },
            pauseAfterMs: 100,
          },
          {
            id: "s2",
            text: "乙",
            intent: { emotion: "neutral", intensity: 0, pace: "normal" },
            control: { type: "edge-prosody", rate: "+0%", pitch: "+0Hz", volume: "+0%" },
            pauseAfterMs: 0,
          },
        ],
      },
      null,
      2,
    )}\n`,
  );

  await withFakeMediaTools(root, async () => {
    const result = await synthesizeProject({ plan: "speech.json", start: root });
    assert.equal(result.timingMode, "asr-fallback");
    assert.equal(result.reviewRequired, true);
    assert.deepEqual(
      json(result.transcriptPath).segments.map((segment) => segment.text),
      ["实际朗读"],
    );
    const calls = readFileSync(asrCalls, "utf8").trim().split("\n").map(JSON.parse);
    assert.equal(calls.length, 1);
    assert.equal(calls[0].media, result.outputPath);
    assert.equal(calls[0].duration, 2.1);
  });
});

test("implausible whole-audio alignment falls back to ASR", async () => {
  const root = initProject({
    dir: join(mkdtempSync(join(tmpdir(), "yumoframe-whole-fallback-")), "project"),
    template: "rotating-flow",
  });
  const fakeTts = join(root, "fake-tts.mjs");
  const fakeAlign = join(root, "fake-align.mjs");
  const fakeAsr = join(root, "fake-asr.mjs");
  const asrCalls = join(root, "asr-calls.txt");
  writeFileSync(
    fakeTts,
    `import {writeFileSync} from 'node:fs'; writeFileSync(process.argv[2], JSON.stringify({duration: 10}));\n`,
  );
  writeFileSync(
    fakeAlign,
    `
import {writeFileSync} from 'node:fs';
writeFileSync(process.argv[4] + '.json', JSON.stringify({engine: 'fake-fa', language: 'zh', duration: 10, segments: [
  {start: 0, end: 1, text: '你好', timestamp: [[0, 500], [500, 1000]]},
]}));
`,
  );
  writeFileSync(
    fakeAsr,
    `
import {appendFileSync, writeFileSync} from 'node:fs';
appendFileSync(process.argv[2], process.argv[3] + '\\n');
writeFileSync(process.argv[4] + '.json', JSON.stringify({engine: 'fake-asr', language: 'zh', duration: 10, segments: [
  {start: 0.2, end: 9.8, text: '你好', timestamp: [[200, 4900], [5100, 9800]]},
]}));
`,
  );
  const configPath = join(root, "yumoframe.config.json");
  const config = json(configPath);
  config.processors.tts = { runner: "command", command: [process.execPath, fakeTts, "{out}"] };
  config.processors.align = { runner: "command", command: [process.execPath, fakeAlign] };
  config.processors.asr = { runner: "command", command: [process.execPath, fakeAsr, asrCalls] };
  writeFileSync(configPath, `${JSON.stringify(config, null, 2)}\n`);

  await withFakeMediaTools(root, async () => {
    const result = await synthesizeProject({ text: "你好", start: root });
    assert.equal(result.timingMode, "asr-fallback");
    assert.equal(result.lastTimestamp, 9.8);
    assert.equal(readFileSync(asrCalls, "utf8").trim().split("\n").length, 1);
    assert.equal(json(result.transcriptPath).engine, "fake-asr");
  });
});

test("synthesize keeps audio-only output when ASR is unavailable", async () => {
  const root = initProject({
    dir: join(mkdtempSync(join(tmpdir(), "yumoframe-audio-only-")), "project"),
    template: "rotating-flow",
  });
  const fakeTts = join(root, "fake-tts.mjs");
  writeFileSync(
    fakeTts,
    `import {writeFileSync} from 'node:fs'; writeFileSync(process.argv[2], JSON.stringify({duration: 2.5}));\n`,
  );
  const configPath = join(root, "yumoframe.config.json");
  const config = json(configPath);
  config.processors.tts = { runner: "command", command: [process.execPath, fakeTts, "{out}"] };
  delete config.processors.align;
  config.processors.asr = { runner: "api", provider: "unavailable" };
  writeFileSync(configPath, `${JSON.stringify(config, null, 2)}\n`);
  writeFileSync(join(root, "transcript.json"), '{"segments":[]}\n');
  writeFileSync(join(root, "transcript.md"), "stale transcript\n");

  await withFakeMediaTools(root, async () => {
    const result = await synthesizeProject({ text: "你好", start: root });
    assert.equal(result.timingMode, "audio-only");
    assert.equal(result.duration, 2.5);
    assert.equal(result.transcriptPath, undefined);
    assert.equal(result.lastTimestamp, null);
    assert.equal(result.coverage, 0);
    assert.equal(result.reviewRequired, false);
    assert.equal(existsSync(result.outputPath), true);
    assert.equal(existsSync(join(root, "transcript.json")), false);
    assert.equal(existsSync(join(root, "transcript.md")), false);
  });
});

test("synthesize CLI emits a stable timing summary without processor secrets", async () => {
  const root = initProject({
    dir: join(mkdtempSync(join(tmpdir(), "yumoframe-summary-")), "project"),
    template: "rotating-flow",
  });
  const fakeUv = join(root, "fake-uv.mjs");
  const fakeUvShim = join(root, "fake-uv");
  const fakeAlign = join(root, "fake-align.mjs");
  writeFileSync(
    fakeUv,
    `
import {writeFileSync} from 'node:fs';
writeFileSync(process.argv[process.argv.indexOf('--output') + 1], JSON.stringify({duration: 2}));
`,
  );
  writeFileSync(fakeUvShim, `#!/bin/sh\nexec "${process.execPath}" "${fakeUv}" "$@"\n`);
  chmodSync(fakeUvShim, 0o755);
  writeFileSync(
    fakeAlign,
    `
import {writeFileSync} from 'node:fs';
writeFileSync(process.argv[4] + '.json', JSON.stringify({engine: 'fake-fa', language: 'zh', duration: 2, segments: [
  {start: 0.1, end: 1.8, text: '你好', timestamp: [[100, 800], [900, 1800]]},
]}));
`,
  );
  const configPath = join(root, "yumoframe.config.json");
  const config = json(configPath);
  config.processors.tts = {
    runner: "uv",
    name: "qwen3-tts",
    uvBin: fakeUvShim,
    env: { TTS_SECRET: "must-not-leak" },
    options: {
      model: "Qwen/Qwen3-TTS-12Hz-0.6B-CustomVoice",
      language: "Chinese",
      speaker: "Vivian",
      device: "cpu",
    },
  };
  config.processors.align = { runner: "command", command: [process.execPath, fakeAlign] };
  writeFileSync(configPath, `${JSON.stringify(config, null, 2)}\n`);

  await withFakeMediaTools(root, async () => {
    const cli = spawnSync(process.execPath, [cliPath, "synthesize", "--text", "你好"], {
      cwd: root,
      encoding: "utf8",
    });
    assert.equal(cli.status, 0, cli.stderr);
    const summary = JSON.parse(cli.stdout);
    assert.deepEqual(Object.keys(summary), [
      "outputPath",
      "transcriptPath",
      "duration",
      "tts",
      "timingMode",
      "lastTimestamp",
      "coverage",
      "reviewRequired",
    ]);
    assert.deepEqual(summary.tts, {
      runner: "uv",
      processor: "qwen3-tts",
      provider: null,
      model: "Qwen/Qwen3-TTS-12Hz-0.6B-CustomVoice",
      voice: "Vivian",
      profile: "qwen3-custom-voice",
    });
    assert.equal(summary.timingMode, "whole-align");
    assert.equal(summary.duration, 2);
    assert.equal(summary.lastTimestamp, 1.8);
    assert.equal(summary.coverage, 0.9);
    assert.doesNotMatch(`${cli.stdout}\n${cli.stderr}`, /must-not-leak|TTS_SECRET/);
  });
});

test("speech plan parser enforces source fidelity and model-specific controls", () => {
  const raw = JSON.stringify({
    version: "0.1.0",
    source: "text.txt",
    segments: [
      {
        id: "s1",
        text: "你好",
        intent: { emotion: "neutral", intensity: 0, pace: "normal" },
        control: { type: "none" },
        pauseAfterMs: 0,
      },
    ],
  });
  const plan = parseSpeechPlan(raw);
  const baseProcessor = {
    runner: "uv",
    name: "qwen3-tts",
    options: { model: "Qwen/Qwen3-TTS-12Hz-1.7B-Base", refAudio: "voice.wav" },
  };
  const base = resolveTtsProfile(baseProcessor);
  assert.doesNotThrow(() => validateSpeechPlan(plan, "你好", base));
  assert.doesNotThrow(() => validateTtsConfiguration(base, baseProcessor));
  const cachedCustomVoice = resolveTtsProfile({
    runner: "uv",
    name: "qwen3-tts",
    options: { model: "/models/Qwen--Qwen3-TTS-12Hz-0.6B-CustomVoice/snapshots/main" },
  });
  assert.equal(cachedCustomVoice.id, "qwen3-custom-voice");
  assert.equal(cachedCustomVoice.controlOptions["qwen-instruct"].required[0], "instruct");
  assert.throws(
    () =>
      resolveTtsProfile({
        runner: "command",
        command: ["edge-tts"],
        profile: "qwen3-custom-voice",
      }),
    /not compatible/,
  );
  assert.throws(
    () =>
      resolveTtsProfile({
        runner: "uv",
        name: "qwen3-tts",
        profile: "qwen3-custom-voice",
        options: { model: "Qwen/Qwen3-TTS-12Hz-1.7B-Base", speaker: "Vivian" },
      }),
    /not compatible/,
  );
  assert.throws(() => validateSpeechPlan(plan, "你好！", base), /exactly reproduce/);
  assert.throws(
    () =>
      validateTtsConfiguration(base, {
        ...baseProcessor,
        options: { model: baseProcessor.options.model },
      }),
    /requires non-empty processors\.tts\.options\.refAudio/,
  );
  assert.throws(
    () => validateTtsConfiguration(base, baseProcessor, tmpdir()),
    /cannot find.*voice\.wav/,
  );
  assert.throws(
    () => parseSpeechPlan(raw.replace('"pauseAfterMs":0', '"pauseAfterMs":10001')),
    /between 0 and 10000/,
  );
  assert.throws(
    () => parseSpeechPlan(raw.replace('"type":"none"', '"type":"none","instruct":"ignored"')),
    /unsupported field: instruct/,
  );
});

test("speech splitter preserves every source character across mechanical units", () => {
  const root = mkdtempSync(join(tmpdir(), "yumoframe-speech-split-"));
  const sourcePath = join(root, "text.txt");
  const source = "  第一句。\n第二句！ 尾巴\n";
  writeFileSync(sourcePath, source);
  const script = join(
    dirname(fileURLToPath(import.meta.url)),
    "../skills/yumoframe/scripts/split-speech.mjs",
  );
  const result = spawnSync(process.execPath, [script, sourcePath], { encoding: "utf8" });
  assert.equal(result.status, 0, result.stderr);
  const split = JSON.parse(result.stdout);
  assert.equal(split.units.map((unit) => unit.text).join(""), source);
  assert.deepEqual(
    split.units.map((unit) => unit.id),
    ["u1", "u2", "u3"],
  );
});

test("OpenAI speech profile exposes only supported delivery fields and protects canonical request fields", () => {
  const processor = { runner: "api", provider: "openai", model: "gpt-4o-mini-tts", voice: "alloy" };
  const profile = resolveTtsProfile(processor);
  assert.equal(profile.id, "openai-gpt-4o-mini-tts");
  const plan = parseSpeechPlan(
    JSON.stringify({
      version: "0.1.0",
      source: "text.txt",
      segments: [
        {
          id: "s1",
          text: "Hello",
          intent: { emotion: "warm", intensity: 0.5, pace: "normal" },
          control: { type: "openai-speech", instructions: "Speak warmly.", speed: 1.1 },
          pauseAfterMs: 0,
        },
      ],
    }),
  );
  assert.doesNotThrow(() => validateSpeechPlan(plan, "Hello", profile));
  assert.throws(
    () =>
      parseSpeechPlan(
        JSON.stringify({
          ...plan,
          segments: [
            {
              ...plan.segments[0],
              control: { type: "openai-speech", instructions: "Fast.", speed: 4.1 },
            },
          ],
        }),
      ),
    /between 0.25 and 4/,
  );
  assert.deepEqual(
    apiSpeechBody(
      { ...processor, options: { model: "wrong-static", input: "wrong-static" } },
      {
        text: "Authoritative text",
        options: { model: "wrong-segment", input: "wrong-segment", instructions: "Warm." },
      },
    ),
    {
      model: "gpt-4o-mini-tts",
      input: "Authoritative text",
      instructions: "Warm.",
      voice: "alloy",
    },
  );
});

test("DashScope uses its native Qwen TTS request and downloads returned audio", async () => {
  const processor = {
    runner: "api",
    provider: "dashscope",
    model: "qwen3-tts-instruct-flash",
    voice: "Cherry",
    apiKeyEnv: "YF_TEST_DASHSCOPE_KEY",
    options: { languageType: "Chinese", optimizeInstructions: true },
  };
  const profile = resolveTtsProfile(processor);
  assert.equal(profile.id, "dashscope-qwen3-tts-instruct-flash");
  const plan = parseSpeechPlan(
    JSON.stringify({
      version: "0.1.0",
      source: "text.txt",
      segments: [
        {
          id: "s1",
          text: "你好",
          intent: { emotion: "happy", intensity: 0.6, pace: "normal" },
          control: { type: "dashscope-instruct", instructions: "开心自然" },
          pauseAfterMs: 0,
        },
      ],
    }),
  );
  assert.doesNotThrow(() => validateSpeechPlan(plan, "你好", profile));
  assert.equal(
    resolveTtsProfile({ ...processor, model: "qwen3-tts-flash" }).id,
    "dashscope-qwen3-tts-flash",
  );
  assert.deepEqual(
    dashscopeSpeechBody(processor, {
      text: "你好",
      options: { instructions: "语速稍快，结尾上扬" },
    }),
    {
      model: processor.model,
      input: {
        text: "你好",
        voice: "Cherry",
        language_type: "Chinese",
        instructions: "语速稍快，结尾上扬",
        optimize_instructions: true,
      },
    },
  );
  assert.throws(
    () =>
      dashscopeSpeechBody(
        { ...processor, model: "qwen3-tts-flash" },
        { text: "你好", options: { instructions: "开心" } },
      ),
    /does not support instructions/,
  );

  const output = join(mkdtempSync(join(tmpdir(), "yumoframe-dashscope-")), "speech.wav");
  const requests = [];
  const originalFetch = globalThis.fetch;
  process.env.YF_TEST_DASHSCOPE_KEY = "test-key";
  globalThis.fetch = async (url, init) => {
    requests.push({ url: String(url), init });
    if (requests.length === 1) {
      return new Response(
        JSON.stringify({ output: { audio: { url: "https://audio.example/speech.wav" } } }),
        {
          status: 200,
          headers: { "Content-Type": "application/json" },
        },
      );
    }
    return new Response(Buffer.from("wav-bytes"), { status: 200 });
  };
  try {
    await runApiSpeech(processor, {
      text: "你好",
      outPath: output,
      options: { instructions: "开心自然" },
    });
    globalThis.fetch = async () =>
      new Response(JSON.stringify({ output: { audio: { data: "%%%" } } }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    await assert.rejects(
      runApiSpeech(processor, {
        text: "你好",
        outPath: output,
        options: { instructions: "开心自然" },
      }),
      /invalid Base64 audio/,
    );
    let emptyDownloadRequest = 0;
    globalThis.fetch = async () =>
      emptyDownloadRequest++ === 0
        ? new Response(
            JSON.stringify({ output: { audio: { url: "https://audio.example/empty.wav" } } }),
            {
              status: 200,
              headers: { "Content-Type": "application/json" },
            },
          )
        : new Response(new Uint8Array(), { status: 200 });
    await assert.rejects(
      runApiSpeech(processor, {
        text: "你好",
        outPath: output,
        options: { instructions: "开心自然" },
      }),
      /audio download was empty/,
    );
  } finally {
    globalThis.fetch = originalFetch;
    delete process.env.YF_TEST_DASHSCOPE_KEY;
  }
  assert.equal(
    requests[0].url,
    "https://dashscope.aliyuncs.com/api/v1/services/aigc/multimodal-generation/generation",
  );
  assert.equal(requests[0].init.headers.Authorization, "Bearer test-key");
  assert.equal(JSON.parse(requests[0].init.body).input.instructions, "开心自然");
  assert.equal(requests[1].url, "https://audio.example/speech.wav");
  assert.equal(readFileSync(output, "utf8"), "wav-bytes");
});

test("forced alignment reads the suffix-replaced FunASR output", async () => {
  const root = initProject({
    dir: join(mkdtempSync(join(tmpdir(), "yumoframe-align-output-")), "project"),
    template: "rotating-flow",
  });
  const fakeTts = join(root, "fake-tts.mjs");
  const fakeAlign = join(root, "fake-align.mjs");
  writeFileSync(
    fakeTts,
    `import {writeFileSync} from 'node:fs'; writeFileSync(process.argv[2], JSON.stringify({duration: 1}));\n`,
  );
  writeFileSync(
    fakeAlign,
    `
import {writeFileSync} from 'node:fs';
const output = process.argv[4].replace(/\\.[^./]+$/, '');
writeFileSync(output + '.json', JSON.stringify({segments: [{start: 0, end: 0.9, text: '你好', timestamp: [[0, 400], [500, 900]]}]}));
`,
  );
  const configPath = join(root, "yumoframe.config.json");
  const config = json(configPath);
  config.processors.tts = { runner: "command", command: [process.execPath, fakeTts, "{out}"] };
  config.processors.align = { runner: "command", command: [process.execPath, fakeAlign] };
  writeFileSync(configPath, `${JSON.stringify(config, null, 2)}\n`);

  await withFakeMediaTools(root, async () => {
    const result = await synthesizeProject({ text: "你好", start: root });
    assert.equal(result.transcriptPath, join(root, "transcript.json"));
    assert.deepEqual(
      json(result.transcriptPath).segments.map((segment) => segment.text),
      ["你好"],
    );
  });
});

test("synthesize persists a project-local output as the narration path", async () => {
  const root = initProject({
    dir: join(mkdtempSync(join(tmpdir(), "yumoframe-tts-output-")), "project"),
    template: "rotating-flow",
  });
  const fakeTts = join(root, "fake-tts.mjs");
  writeFileSync(
    fakeTts,
    `import {writeFileSync} from 'node:fs'; writeFileSync(process.argv[2], JSON.stringify({duration: 1}));\n`,
  );
  const configPath = join(root, "yumoframe.config.json");
  const config = json(configPath);
  config.processors.tts = { runner: "command", command: [process.execPath, fakeTts, "{out}"] };
  delete config.processors.align;
  config.processors.asr = { runner: "api", provider: "unavailable" };
  writeFileSync(configPath, `${JSON.stringify(config, null, 2)}\n`);

  await withFakeMediaTools(root, async () => {
    const result = await synthesizeProject({ text: "你好", out: "assets/custom.mp3", start: root });
    assert.equal(result.outputPath, join(root, "assets/custom.mp3"));
    assert.equal(json(configPath).paths.media, "assets/custom.mp3");
    assert.equal(json(configPath).paths.voice, "assets/custom.mp3");
    assert.equal(
      resolveProject(root, { align: false }).project.audio.voice.src,
      "assets/custom.mp3",
    );

    await synthesizeProject({ text: "你好", out: "assets/second.mp3", start: root });
    assert.equal(
      resolveProject(root, { align: false }).project.audio.voice.src,
      "assets/second.mp3",
    );

    const outside = join(dirname(root), "outside.mp3");
    await assert.rejects(
      synthesizeProject({ text: "你好", out: outside, start: root }),
      /inside the project/,
    );
    assert.equal(existsSync(outside), false);

    const escaped = join(dirname(root), "escaped");
    mkdirSync(escaped);
    symlinkSync(escaped, join(root, "linked"), process.platform === "win32" ? "junction" : "dir");
    await assert.rejects(
      synthesizeProject({ text: "你好", out: "linked/escaped.mp3", start: root }),
      /inside the project/,
    );
    assert.equal(existsSync(join(escaped, "escaped.mp3")), false);
  });
});

test("TTS subtitles parse into cue-level transcript segments (VTT and SRT)", () => {
  const vtt =
    "WEBVTT\n\n00:00:00.000 --> 00:00:00.500 align:start\n大家好\n\n00:00:00.500 --> 00:00:01.200\n今天讲个笑话\n";
  assert.deepEqual(
    subtitlesToTranscript(vtt).segments.map((s) => [s.start, s.end, s.text]),
    [
      [0, 0.5, "大家好"],
      [0.5, 1.2, "今天讲个笑话"],
    ],
  );
  // edge-tts emits SRT: index line + comma millisecond separator.
  const srt =
    "1\n00:00:00,100 --> 00:00:00,600\n大家好\n\n2\n00:00:00,600 --> 00:00:01,200\n今天讲个笑话\n";
  assert.deepEqual(
    subtitlesToTranscript(srt).segments.map((s) => [s.start, s.end, s.text]),
    [
      [0.1, 0.6, "大家好"],
      [0.6, 1.2, "今天讲个笑话"],
    ],
  );
  assert.throws(() => subtitlesToTranscript("WEBVTT\n\n"), /No cues/);
});

test("eject copies the template and switches config to local", () => {
  const parent = mkdtempSync(join(tmpdir(), "yumoframe-eject-"));
  const root = initProject({ dir: join(parent, "project"), template: "rotating-flow" });
  ejectProject(root);
  const config = json(join(root, "yumoframe.config.json"));
  assert.equal(config.templateSource, "local");
  assert.equal(config.templatePath, "templates/rotating-flow");
  assert.equal(existsSync(join(root, config.templatePath, "src", "index.tsx")), true);
  assert.equal(existsSync(join(root, config.templatePath, "adapter-dist", "index.cjs")), true);
  assert.equal(existsSync(join(root, config.templatePath, "node_modules")), false);
  assert.throws(() => ejectProject(root), /already exists/);
});

test("ejected local adapter-dist drives CLI validate and resolve", () => {
  const root = initProject({
    dir: join(mkdtempSync(join(tmpdir(), "yumoframe-local-adapter-")), "project"),
    template: "center-line",
  });
  ejectProject(root);
  writeFileSync(
    join(root, "templates", "center-line", "adapter-dist", "index.cjs"),
    `module.exports = {
  centerLineAdapter: {
    id: "center-line",
    createInitialFiles() { return {}; },
    resolve() { throw new Error("local-resolve"); },
    validate() { return ["from-local-adapter"]; },
    validateResolved() { return []; },
  },
};
`,
  );
  assert.deepEqual(validateCurrentProject(root), ["from-local-adapter"]);
  assert.throws(() => resolveProject(root), /local-resolve/);
  assert.equal(loadTemplateContext(root).adapter.id, "center-line");
});

test("doctor and template listing expose required runtime capabilities", () => {
  assert.deepEqual(listTemplates(), ["rotating-flow", "center-line", "chat-bubbles"]);
  assert.deepEqual(
    listTemplateManifests().map((manifest) => manifest.id),
    ["rotating-flow", "center-line", "chat-bubbles"],
  );
  assert.deepEqual(
    doctorChecks(() => "/mock/bin/tool").map((check) => check.name),
    ["node", "uv", "ffmpeg", "rotating-flow", "center-line", "chat-bubbles", "funasr", "qwen3-tts"],
  );
  assert.ok(doctorChecks(() => null).some((check) => check.ok === false));
});

test("template context validates packaged and local manifests strictly", () => {
  const parent = mkdtempSync(join(tmpdir(), "yumoframe-template-context-"));
  const runtimeRoot = initProject({ dir: join(parent, "runtime"), template: "rotating-flow" });
  const runtimeContext = loadTemplateContext(runtimeRoot);
  assert.equal(runtimeContext.manifest.id, "rotating-flow");
  assert.equal(runtimeContext.registration.id, "rotating-flow");
  assert.equal(runtimeContext.adapter.id, "rotating-flow");
  assert.match(
    runtimeContext.files.adapter,
    /packages\/templates\/rotating-flow\/adapter-dist\/index\.js$/,
  );
  assert.match(runtimeContext.files.entry, /packages\/templates\/rotating-flow\/src\/index\.tsx$/);
  assert.match(
    runtimeContext.files.authoringGuide,
    /packages\/templates\/rotating-flow\/authoring\.md$/,
  );

  const localRoot = initProject({ dir: join(parent, "local"), template: "rotating-flow" });
  ejectProject(localRoot);
  const localTemplateRoot = join(localRoot, "templates", "rotating-flow");
  const localManifestPath = join(localTemplateRoot, "template.json");
  const originalManifest = json(localManifestPath);
  const unsafeManifest = structuredClone(originalManifest);
  unsafeManifest.entry = "../outside.tsx";
  writeFileSync(localManifestPath, `${JSON.stringify(unsafeManifest, null, 2)}\n`);
  assert.throws(() => loadTemplateContext(localRoot), /must stay inside the template root/);

  unlinkSync(localManifestPath);
  assert.throws(() => loadTemplateContext(localRoot), /Template manifest not found/);
  writeFileSync(localManifestPath, `${JSON.stringify(originalManifest, null, 2)}\n`);
  const localContext = loadTemplateContext(localRoot);
  assert.equal(localContext.templateRoot, localTemplateRoot);
  assert.equal(localContext.metadataRoot, localTemplateRoot);
  assert.match(localContext.files.adapter, /templates\/rotating-flow\/adapter-dist\/index\.js$/);
  assert.match(localContext.files.entry, /templates\/rotating-flow\/src\/index\.tsx$/);
  assert.match(localContext.files.authoringGuide, /templates\/rotating-flow\/authoring\.md$/);

  const inspected = inspectProject(localRoot);
  assert.equal(inspected.template.id, "rotating-flow");
  assert.equal(inspected.template.source, "local");
  assert.match(inspected.template.guide, /Rotating Flow/);
  assert.equal(inspected.template.schemas.storyboard.properties.template.const, "rotating-flow");
  assert.equal("files" in inspected.template, false);
  assert.deepEqual(inspected.template.capabilities, { syncProject: true, layoutPreview: true });
  const inspectCli = spawnSync(process.execPath, [cliPath, "inspect", "--json"], {
    cwd: localRoot,
    encoding: "utf8",
  });
  assert.equal(inspectCli.status, 0, inspectCli.stderr);
  assert.equal(JSON.parse(inspectCli.stdout).template.id, "rotating-flow");
});
