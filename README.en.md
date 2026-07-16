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

# Install Skill
npx skills add yuchenii/YumoFrame --skill yumoframe-comedy-text
```

`doctor` checks [Node](https://nodejs.org/), [uv](https://docs.astral.sh/uv/getting-started/installation/), [ffmpeg](https://ffmpeg.org/download.html), the packaged template, and the ASR/TTS processors. Text-only work can skip uv and ffmpeg; local Qwen3-TTS needs uv, while media transcription needs uv and ffmpeg. See `yumoframe --help` for command details.

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
yumoframe doctor          # check Node, uv, ffmpeg, template, and processors
```

Use `eject` only when the template source itself must be customized. Normal projects remain data-only.

## Text-to-speech (TTS)

`processors.tts` shares the same shape as `processors.asr`; pick an engine via `runner`:

| runner | Purpose | User needs |
|--------|---------|------------|
| `uv` | Bundled local engine (Qwen3-TTS by default; FunASR also uses it) | uv only; venv is cached automatically |
| `command` | External CLI with `{text}` / `{out}` placeholders (e.g. `uvx edge-tts`) | install-free once uv is present; `uvx` fetches on first use |
| `api` | Online TTS (native Alibaba Qwen-TTS, OpenAI-compatible endpoints, …) | just one API key — no uv required |

`init` defaults to the local `Qwen/Qwen3-TTS-12Hz-0.6B-CustomVoice` model with language `Chinese`, the Mandarin `Vivian` voice, and `assets/input.wav` output. The first run creates an isolated cached venv and downloads the model; weights are not shipped in the npm package. It also configures FunASR `fa-zh` to force-align the generated audio against the known source text, without recognizing the audio back into text.

Available local Qwen3-TTS models:

| Model | Best for | Required configuration |
|-------|----------|------------------------|
| `Qwen/Qwen3-TTS-12Hz-0.6B-CustomVoice` (default) | Faster, lower-memory synthesis with a built-in voice such as Vivian | `speaker`; optional `instruct` |
| `Qwen/Qwen3-TTS-12Hz-1.7B-CustomVoice` | Higher-quality synthesis while keeping a built-in voice | `speaker`; optional `instruct` |
| `Qwen/Qwen3-TTS-12Hz-1.7B-VoiceDesign` | Designing a new voice and delivery style in natural language | `instruct` is required; `speaker` is unused |
| `Qwen/Qwen3-TTS-12Hz-1.7B-Base` | Cloning a voice from reference audio | `refAudio` is required; `refText` is recommended |

The official documentation does not publish a reliable VRAM threshold. Prefer 0.6B without an accelerator or when speed matters. With CUDA/MPS available, choose a 1.7B model when quality is worth the extra memory and wait. Choose VoiceDesign/Base by purpose, not parameter count alone.

```jsonc
// 1.7B built-in voice
"options": {"model": "Qwen/Qwen3-TTS-12Hz-1.7B-CustomVoice", "language": "Chinese", "speaker": "Vivian", "device": "auto"}

// 1.7B voice design
"options": {"model": "Qwen/Qwen3-TTS-12Hz-1.7B-VoiceDesign", "language": "Chinese", "instruct": "A clear, natural, friendly young Mandarin female voice", "device": "auto"}

// 1.7B voice cloning; refAudio is resolved from the project config directory
"options": {"model": "Qwen/Qwen3-TTS-12Hz-1.7B-Base", "language": "Chinese", "refAudio": "assets/reference.wav", "refText": "Transcript of the reference audio", "device": "auto"}
```

Without `refText`, Base falls back to speaker-embedding-only cloning, which usually reduces quality. Reference-audio processing may require the system SoX executable (macOS: `brew install sox`).

`options.model` may be either a Hugging Face model ID or an already-downloaded local snapshot directory. Keep `-CustomVoice`, `-VoiceDesign`, or `-Base` in the official directory name so both YumoFrame and the Python processor identify its capabilities without downloading the weights again.

For the lighter edge-tts option, replace `tts` with the configuration below. It also emits subtitles, so timing uses tier 1 directly:

```jsonc
"tts": {
  "runner": "command",
  "profile": "edge-tts",
  "command": ["uvx", "--from", "edge-tts>=7.2.8", "edge-tts", "--voice", "zh-CN-YunxiNeural", "--text", "{text}", "--write-media", "{out}", "--write-subtitles", "{subs}"]
}
```

edge-tts depends on Microsoft's online service, so old builds may return `403` when its token rotates; use `uvx --refresh …` or raise the version floor. It emits MP3, so also set `paths.media` to `assets/input.mp3` when switching. For an online API, use:

```jsonc
"tts": {
  "runner": "api",
  "provider": "dashscope",
  "model": "qwen3-tts-instruct-flash",
  "voice": "Cherry",
  "apiKeyEnv": "DASHSCOPE_API_KEY",  // key lives in the env var, never in the config
  "options": {"languageType": "Chinese"}
}
```

`dashscope` (with `qwen3-tts` retained as a legacy alias) calls the [native Alibaba Qwen-TTS HTTP API](https://help.aliyun.com/zh/model-studio/qwen-tts-api) and immediately downloads its temporary audio URL. `qwen3-tts-instruct-flash` supports segmented instructions; switching to `qwen3-tts-flash` limits synthesis to whole text. Other API providers keep their existing paths.

DashScope defaults to the Beijing API root, `https://dashscope.aliyuncs.com/api/v1`. To switch regions, set `baseUrl` to that region's API root and use an API key from the same region. The supported `options` are `languageType`, `instructions`, and `optimizeInstructions`: whole-text synthesis may set global `instructions` for an instruct model; segmented synthesis gets instructions from each `speech.json` segment; boolean `optimizeInstructions` remains global and requires global or per-segment `instructions` in the request. `languageType` accepts `Auto`, `Chinese`, `English`, `German`, `Italian`, `Portuguese`, `Spanish`, `Japanese`, `Korean`, `French`, or `Russian`.

```bash
yumoframe synthesize                       # reads paths.ttsText (default text.txt); alias: yumoframe tts
yumoframe synthesize --text "inline text"  # pass text directly
yumoframe synthesize --out out/voice.wav   # choose the output path
```

The synthesis output must stay inside the project. After writing the audio, the CLI automatically synchronizes its actual project-relative path to both `paths.media` and `paths.voice`; the next `resolve` attaches it as narration without copying files or hand-editing config.

### TTS delivery plan

For voiced projects authored through the `yumoframe-comedy-text` Skill, `speech.json` is mandatory. The Agent first splits the exact source into short immutable units at natural sentence and clause boundaries (including commas, colons, semicolons, and dashes). If a unit still changes speaker, emotion, emphasis, or pace internally, it is split again at the exact character boundary without rewriting the source. The Agent then shows the complete plan and may synthesize only after approval. Bare `yumoframe synthesize` remains available solely as a CLI compatibility path outside the Skill.

```bash
yumoframe synthesize --capabilities       # inspect allowed controls without loading a model
yumoframe synthesize --plan speech.json   # generate, merge, and align the reviewed plan
```

`text.txt` remains canonical and the model stays in `yumoframe.config.json` under `processors.tts`. `speech.json` contains only performance sections: engine-neutral `intent` (emotion, intensity, pace, note) plus a model-specific `control`. `--capabilities` also returns allowed controls, required configuration, field constraints, and examples. Before any model download or API request, the CLI verifies exact source reproduction, model/control compatibility, required configuration, and parameter ranges; unsupported delivery is never silently ignored.

The currently executable engines use the controls below. Runtime behavior is still authoritative in `yumoframe synthesize --capabilities`:

| Engine / model | Control | Segmented execution |
|----------------|---------|---------------------|
| Qwen3-TTS CustomVoice | `qwen-instruct` | One local model load, batched generation |
| Qwen3-TTS VoiceDesign | `qwen-voice-design` | One local model load, batched generation |
| Qwen3-TTS Base | `none` | Local batched generation, neutral delivery only |
| edge-tts (`edge-tts` profile) | `edge-prosody` | Sequential generation |
| DashScope `qwen3-tts-instruct-flash` | `dashscope-instruct` | Sequential API calls |
| DashScope `qwen3-tts-flash` | `none` | Whole-text neutral delivery only |
| OpenAI `gpt-4o-mini-tts` | `openai-speech` | Sequential API calls |

Local Qwen loads once for the complete plan and uses its batch API. For VoiceDesign, the worker automatically prepends the plan's single stable `voice.description` to every segment instruction to reduce cross-segment voice drift. Online segmented profiles call their APIs in order. Before merging, FunASR `fa-zh` aligns every fragment independently; YumoFrame offsets those timestamps by the real preceding fragment durations plus `pauseAfterMs`, then ffmpeg builds the final track from the same fragments. This prevents inter-fragment pauses from being compressed into a whole-script timeline and never estimates timing from character counts.

### Where timing comes from (automatic 3-tier fallback)

`text → TTS → ASR → text` is lossy (homophones, numbers, inserted/dropped chars), so the TTS route avoids ASR when it can:

| Tier | Condition | How | Mismatch? |
|------|-----------|-----|-----------|
| 1 | TTS can emit timestamps | `{subs}` in the command (e.g. edge-tts `--write-subtitles`) → subtitles become `transcript.json` | No (same source) |
| 2 | Audio only, text known | set `processors.align` (per-fragment for a plan; whole-track for compatibility) → validate and write `transcript.json` | Text is known, but timing still requires validation |
| 3 | Neither | run `yumoframe transcribe` (ASR) afterwards → proofread | Yes, fixed by proofreading |

The default Qwen3-TTS processor returns audio only, but new projects configure FunASR `fa-zh` and therefore use tier 2 automatically. If alignment is missing timestamps, has a token-count mismatch, is non-monotonic or out of range, or leaves an implausibly long uncovered tail, the CLI rejects it and falls back to the configured ASR on the final audio. Reproducing the known text is therefore not enough to prove correct timing. The optional edge-tts command includes `{subs}` and uses tier 1 directly. The default aligner configuration is:

Forced alignment retains character timestamps and splits the known source at punctuation into reviewable `transcript.md` sections. A whole script collapsing into one section indicates a punctuation/token-to-timestamp mismatch and is not a normal result.

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
