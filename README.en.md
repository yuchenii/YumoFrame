# YumoFrame

English | [中文](README.md)

[![npm version](https://img.shields.io/npm/v/yumoframe.svg?style=flat)](https://www.npmjs.com/package/yumoframe)
[![npm downloads](https://img.shields.io/npm/dm/yumoframe.svg?style=flat)](https://www.npmjs.com/package/yumoframe)
[![skills.sh](https://skills.sh/b/yuchenii/YumoFrame)](https://skills.sh/yuchenii/YumoFrame)

YumoFrame is a Remotion-based CLI for creating reusable vertical videos from structured project data.

v0.1 ships the `comedy-text` template: black background, heavy Chinese text, mint highlights, typewriter reveal, cursor blocks, rotating scenes, and automatic camera fitting.

Typical flow: install the tools, describe the goal to your agent, confirm/edit a few review points, then render after the preview looks right. Line breaks, highlights, and scene grouping stay with the agent — never hand-edit `project.json`.

## Install

```bash
npm install -g yumoframe
yumoframe --version
yumoframe doctor

# Authoring skill (current project)
npx skills add yuchenii/YumoFrame --skill yumoframe-comedy-text
```

`doctor` checks [Node](https://nodejs.org/), [uv](https://docs.astral.sh/uv/getting-started/installation/), [ffmpeg](https://ffmpeg.org/download.html), the packaged template, and the ASR processor. Text-only work can skip uv and ffmpeg; media transcription needs both. See `yumoframe --help` for command details.

## How to use

Describe the goal in the project directory, for example:

- “Make a comedy-text vertical video from this copy: …”
- “Make a video from `assets/source.mp3` and keep the original voice.”

Text and media share the same pipeline; transcription is the main difference:

| Input | Outline | Good checkpoints |
|------|---------|------------------|
| Text | `init` → author `lines.json` / `storyboard.json` (with clocks) → `resolve` → `validate` → `studio` → `render` | `project.md`, studio preview; render only after approval |
| Audio / video | `init` → place media + `transcribe` → proofread `transcript.md` → `sync` → author lines/storyboard (**no clocks**) → `resolve --align` → `validate` → `studio` → `render` | transcript proofreading, `project.md`, studio preview; render only after approval |

The skill asks for step-by-step confirmation and should not silently chain validate → studio → render.

## Key files

| File | Notes |
|------|------|
| `transcript.md` | Transcript review. Edit `校对：` only; keep clocks and `原文：`; then run `yumoframe sync transcript` |
| `project.md` | Human-readable storyboard. Adjust scene grouping, copy, and `**highlight**`; heading clocks / `rotate` are display-only |
| `lines.json` / `storyboard.json` | Authoring files for breaks, highlights, and scenes (agent-maintained); omit `start`/`end` when a transcript exists |
| `transcript.json` / `project.json` | CLI-generated machine files; do not hand-edit `project.json` |

You can also run these directly when needed:

```bash
yumoframe validate
yumoframe studio   # alias: yumoframe dev
yumoframe render   # after the preview looks good
```

## Other commands

```bash
yumoframe templates       # list packaged templates
yumoframe layout          # write the configured SVG layout preview
yumoframe eject           # copy the runtime template into the project
yumoframe doctor          # check Node, uv, ffmpeg, template, and ASR processor
```

Use `eject` only when the template source itself must be customized. Normal projects remain data-only.

## Documentation

- [Development guide](docs/development.md) — setup, rebuild, local skill path, tests, pack layout
- [Architecture](docs/architecture.md) — runtime vs data-only projects
