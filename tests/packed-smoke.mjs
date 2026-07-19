import assert from "node:assert/strict";
import { existsSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";

const bin = process.argv[2];
if (!bin) throw new Error("Usage: node tests/packed-smoke.mjs <packed-yumoframe-bin>");
const skipRender = process.argv.includes("--skip-render");
const packageVersion = JSON.parse(
  readFileSync(new URL("../package.json", import.meta.url), "utf8"),
).version;

const env = process.env;
const run = (args, cwd = process.cwd()) => {
  const result = spawnSync(bin, args, { cwd, env, encoding: "utf8" });
  if (result.status !== 0)
    throw new Error(`${args.join(" ")} failed\n${result.stdout}\n${result.stderr}`);
  return result.stdout;
};

assert.equal(run(["--version"]).trim(), packageVersion);
assert.equal(run(["templates"]).trim(), "rotating-flow\ncenter-line\nchat-bubbles");
assert.match(run(["doctor"]), /OK funasr/);

const parent = mkdtempSync(join(tmpdir(), "yumoframe-packed-"));
const storyboards = {
  "rotating-flow": {
    version: "0.1.0",
    template: "rotating-flow",
    endOverview: false,
    scenes: [
      { lines: [{ start: 0, end: 0.3, segments: [{ text: "打包测试", highlight: false }] }] },
    ],
  },
  "center-line": {
    version: "0.1.0",
    template: "center-line",
    lines: [{ id: "line-001", text: "打包测试", start: 0, end: 0.3, emphasis: [] }],
  },
  "chat-bubbles": {
    version: "0.1.0",
    template: "chat-bubbles",
    participants: [
      { id: "friend", name: "朋友", side: "left" },
      { id: "me", name: "我", side: "right" },
    ],
    messages: [
      {
        id: "message-001",
        speaker: "friend",
        type: "text",
        text: "打包测试",
        durationMs: 300,
        pauseAfterMs: 0,
      },
    ],
  },
};

for (const template of Object.keys(storyboards)) {
  const root = join(parent, template);
  run(["init", root, "--template", template]);
  const configPath = join(root, "yumoframe.config.json");
  const config = JSON.parse(readFileSync(configPath, "utf8"));
  config.render = { ...config.render, width: 270, height: 480, fps: 10 };
  writeFileSync(configPath, `${JSON.stringify(config, null, 2)}\n`);
  writeFileSync(
    join(root, "storyboard.json"),
    `${JSON.stringify(storyboards[template], null, 2)}\n`,
  );
  run(["resolve"], root);
  run(["validate"], root);
  assert.equal(JSON.parse(readFileSync(join(root, "project.json"), "utf8")).template, template);
  if (!skipRender) {
    run(["render"], root);
    assert.equal(existsSync(join(root, "out", "video.mp4")), true);
  }
  assert.equal(existsSync(join(root, "node_modules")), false);
  assert.equal(existsSync(join(root, ".venv")), false);
}

const ejectedRoot = join(parent, "chat-bubbles");
const ejectedConfigPath = join(ejectedRoot, "yumoframe.config.json");
run(["eject"], ejectedRoot);
const ejectedConfig = JSON.parse(readFileSync(ejectedConfigPath, "utf8"));
ejectedConfig.paths.output = "out/ejected.mp4";
writeFileSync(ejectedConfigPath, `${JSON.stringify(ejectedConfig, null, 2)}\n`);
if (!skipRender) {
  run(["render"], ejectedRoot);
  assert.equal(existsSync(join(ejectedRoot, "out", "ejected.mp4")), true);
}
assert.equal(existsSync(join(ejectedRoot, "templates", "chat-bubbles", "node_modules")), false);

console.log(`Packed CLI smoke test passed: ${parent}`);
