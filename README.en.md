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
- “Synthesize speech from `text.txt`, then make a voiced video.”

Text, text-to-speech, and media share the same pipeline; the difference is where the voice track comes from:

| Input | Outline | Good checkpoints |
|------|---------|------------------|
| Text | `init` → author `lines.json` / `storyboard.json` (with clocks) → `resolve` → `validate` → `studio` → `render` | `project.md`, studio preview; render only after approval |
| Text-to-speech | `init` → write `text.txt` + `synthesize` (voice track **+ timing**; `transcribe` only as fallback) → proofread → `sync` → author lines/storyboard (**no clocks**) → `resolve` → … | auditioning the synthesized track, `project.md`, studio preview |
| Audio / video | `init` → place media + `transcribe` → proofread `transcript.md` → `sync` → author lines/storyboard (**no clocks**) → `resolve` → `validate` → `studio` → `render` | transcript proofreading, `project.md`, studio preview; render only after approval |

`synthesize` (alias `tts`) uses `processors.tts` to make a voice track from text (written to `paths.media` by default). Timing still comes only from the transcript, never invented — but the TTS route **avoids the ASR round-trip** where possible (so the source text and recognized text can't drift apart), picking a timing source from the three tiers below.

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

## Text-to-speech (TTS)

`processors.tts` shares the same shape as `processors.asr`; pick an engine via `runner`:

| runner | Purpose | User needs |
|--------|---------|------------|
| `api` | Online TTS over an OpenAI-compatible `/audio/speech` (qwen3-tts, openai, …) | just one API key — no uv required |
| `command` | External CLI with `{text}` / `{out}` placeholders (e.g. `uvx edge-tts`) | install-free once uv is present; `uvx` fetches on first use |
| `uv` | Local engine (funasr uses this; local TTS not bundled yet) | uv only; venv is cached automatically |

`init` defaults to edge-tts (`command` + `uvx --from 'edge-tts>=7.2.8'`: install-free, no key). edge-tts reverse-engineers a Microsoft service, so old builds return `403` when the token rotates — the default pins a version floor; if it 403s again later, run once with `uvx --refresh …` or raise the floor. For online TTS, switch `tts` to:

```jsonc
"tts": {
  "runner": "api",
  "provider": "qwen3-tts",
  "model": "qwen3-tts-flash",
  "voice": "Cherry",
  "apiKeyEnv": "DASHSCOPE_API_KEY"   // key lives in the env var, never in the config
}
```

```bash
yumoframe synthesize                       # reads paths.ttsText (default text.txt); alias: yumoframe tts
yumoframe synthesize --text "inline text"  # pass text directly
yumoframe synthesize --out out/voice.wav   # choose the output path
```

### Where timing comes from (automatic 3-tier fallback)

`text → TTS → ASR → text` is lossy (homophones, numbers, inserted/dropped chars), so the TTS route avoids ASR when it can:

| Tier | Condition | How | Mismatch? |
|------|-----------|-----|-----------|
| 1 | TTS can emit timestamps | `{subs}` in the command (e.g. edge-tts `--write-subtitles`) → subtitles become `transcript.json` | No (same source) |
| 2 | Audio only, text known | set `processors.align` (forced align: audio + known text) → `transcript.json` | No (text is given) |
| 3 | Neither | run `yumoframe transcribe` (ASR) afterwards → proofread | Yes, fixed by proofreading |

The default edge-tts command already includes `{subs}` (tier 1, no ASR). For API TTS that returns audio only, add a forced aligner for tier 2 — funasr ships an alignment mode:

```jsonc
"align": {
  "runner": "uv",
  "name": "funasr",
  "options": {"model": "fa-zh"}   // time the KNOWN text with an alignment model; no recognition
}
// or an external aligner:
"align": {"runner": "command", "command": ["my-aligner"]}  // gets audioPath textPath outputBase, writes transcript.json
```

Keys in `options` are forwarded as `--kebab` flags, so local uv engines can pick a model: ASR `{"model":"paraformer-zh-streaming"}`, alignment `{"model":"fa-zh"}`, etc.

When `synthesize` produces `transcript.json`, continue with `resolve → render`; otherwise run `transcribe` first.

## Documentation

- [Development guide](docs/development.md) — setup, rebuild, local skill path, tests, pack layout
- [Architecture](docs/architecture.md) — runtime vs data-only projects
