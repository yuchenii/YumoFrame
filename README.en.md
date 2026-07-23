# YumoFrame

English | [中文](README.md)

[![npm version](https://img.shields.io/npm/v/yumoframe.svg?style=flat)](https://www.npmjs.com/package/yumoframe) [![npm downloads](https://img.shields.io/npm/dm/yumoframe.svg?style=flat)](https://www.npmjs.com/package/yumoframe) [![skills.sh](https://skills.sh/b/yuchenii/YumoFrame)](https://skills.sh/yuchenii/YumoFrame)

YumoFrame is a Remotion-based CLI for creating reusable vertical videos from structured project data.

Built-in Templates include `rotating-flow` for rotating kinetic text, `center-line` for centered sequential lines, and `chat-bubbles` for participant-based text conversations; `center-line` includes the `minimal-dark` and `echo` Presets.

Typical flow: install the tools, describe the goal to your agent, confirm/edit a few review points, then render after the preview looks right. Line breaks, highlights, and scene grouping stay with the agent — never hand-edit `project.json`.

## Install

```bash
npm install -g yumoframe
yumoframe --version
yumoframe doctor

# Install Skill
npx skills add yuchenii/YumoFrame --skill yumoframe
```

`doctor` checks [Node](https://nodejs.org/), [uv](https://docs.astral.sh/uv/getting-started/installation/), [ffmpeg](https://ffmpeg.org/download.html), the packaged template, and the ASR/TTS processors. Text-only work can skip uv and ffmpeg; local Qwen3-TTS needs uv, while media transcription needs uv and ffmpeg. See `yumoframe --help` for command details.

## How to use

Describe the goal in the project directory, for example:

- “Make a rotating-flow vertical video from this copy: …”
- “Use center-line with the echo treatment for these short lines.”
- “Turn this conversation into a chat-bubbles video.”
- “Make a video from `assets/source.mp3` and keep the original voice.”
- “Synthesize speech from `text.txt`, then make a voiced video.”

Choose the Template whose data structure matches the project. Only `center-line` also selects visual Presets within the same structure:

```bash
yumoframe init ./rotating-demo --template rotating-flow
yumoframe init ./center-demo --template center-line --preset echo
yumoframe init ./chat-demo --template chat-bubbles
```

Text, text-to-speech, and media share the same pipeline; the difference is where the voice track comes from:

| Input | Outline | Good checkpoints |
| --- | --- | --- |
| Text | `init` → author the Template Guide data (including timing/duration when needed) → `resolve` → `validate` → `studio` → `render` | authoring data, studio preview; render only after approval |
| Text-to-speech | `init` → write `text.txt` + `synthesize` (voice track **+ timing**; `transcribe` only as fallback) → proofread → `sync` → author lines/storyboard (**no clocks**) → `resolve` → … | auditioning the synthesized track, `project.md`, studio preview |
| Audio / video | `init` → place media + `transcribe` → proofread `transcript.md` → `sync` → author lines/storyboard (**no clocks**) → `resolve` → `validate` → `studio` → `render` | transcript proofreading, `project.md`, studio preview; render only after approval |

`synthesize` (alias `tts`) uses `processors.tts` to make a voice track from text (written to `paths.media` by default). Timing still comes only from the transcript, never invented; the TTS route avoids the ASR round-trip where possible — see the [TTS guide (Chinese)](docs/tts.md).

The skill asks for step-by-step confirmation and should not silently chain validate → studio → render.

## Key files

| File | Notes |
| --- | --- |
| `transcript.md` | Transcript review. Edit `校对：` only; keep clocks and `原文：`; then run `yumoframe sync transcript` |
| `project.md` | Human-readable `rotating-flow` storyboard; other Templates do not require it |
| `lines.json` | Flat `rotating-flow` line intermediate; other Templates do not use it |
| `storyboard.json` | Template-owned authoring contract: `scenes[]`, `lines[]`, or `participants[] + messages[]`; do not invent clocks when a transcript exists |
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
yumoframe inspect --json  # machine-readable template contract and capabilities (preferred by Skill)
yumoframe layout          # rotating-flow-only SVG layout preview
yumoframe eject           # copy the runtime template into the project
yumoframe doctor          # check Node, uv, ffmpeg, template, and processors
```

Use `eject` only when the template source itself must be customized. Normal projects remain data-only.

## Text-to-speech (TTS)

`synthesize` (alias `tts`) turns text into a voice track via `processors.tts`. Pick an engine with `runner`:

| runner | Purpose | User needs |
| --- | --- | --- |
| `uv` | Bundled local engine (Qwen3-TTS by default) | uv; first run downloads the model |
| `command` | External CLI (e.g. `uvx edge-tts`) | uv is enough |
| `api` | Online TTS (DashScope Qwen / CosyVoice, OpenAI-compatible, …) | an API key |

New projects default to local Qwen3-TTS 0.6B + Vivian, with FunASR `fa-zh` timing the known source text. Bundled models download from ModelScope by default and reuse that cache; rerunning after an interruption resumes from the same source rather than switching hubs. API and local models share one registry: built-in models resolve their protocol and profile automatically, while custom API models must declare both explicitly. Skill-authored voiced work must review `speech.json` before `yumoframe synthesize --plan`; bare `synthesize` remains available for whole-text synthesis outside the Skill.

```bash
yumoframe synthesize --capabilities   # inspect allowed controls for the active model
yumoframe synthesize --plan speech.json
```

Timing falls back through subtitles → forced alignment → ASR, avoiding a lossy TTS→ASR round-trip when possible.

Full configuration (models, edge-tts / DashScope examples, delivery plans, alignment tiers) is in the Chinese guide: **[语音合成指南](docs/tts.md)**.

## Documentation

- [TTS guide (Chinese)](docs/tts.md) — runners, models, `speech.json`, timing fallbacks
- [Development guide](docs/development.md) — setup, rebuild, local skill path, tests, pack layout
- [Architecture](docs/architecture.md) — package layout vs data-only projects
