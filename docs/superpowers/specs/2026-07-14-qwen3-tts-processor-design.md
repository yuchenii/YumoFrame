# Qwen3-TTS Processor Design

> **Path note (2026-07):** Design-time paths below may still say `runtime/processors/…`. The processor now lives at `processors/qwen3-tts/`.

## Goal

Ship a bundled local Qwen3-TTS processor and make it the default text-to-speech engine for newly initialized YumoFrame projects. Keep edge-tts available as an opt-in command processor.

## Defaults

- Processor: `qwen3-tts` with the existing `uv` runner
- Model: `Qwen/Qwen3-TTS-12Hz-0.6B-CustomVoice`
- Language: `Chinese`
- Speaker: `Vivian`
- Audio format: WAV
- Alignment: bundled FunASR `fa-zh` against the known source text

`CustomVoice` is the default because it can synthesize directly with a built-in speaker. The Base model is not a default: it requires reference audio for voice cloning.

## Architecture

Add one packaged Python uv project at `runtime/processors/qwen3-tts/`. Its CLI accepts text, output path, model-specific options, and device, loads `Qwen3TTSModel`, calls the matching generation API, and writes the returned waveform with its returned sample rate.

The model suffix selects the official generation API: `CustomVoice` uses `generate_custom_voice`, `VoiceDesign` uses `generate_voice_design` and requires `instruct`, and `Base` uses `generate_voice_clone` and requires `refAudio` (with `refText` recommended). Project-relative reference audio resolves from the directory containing `yumoframe.config.json`.

The TypeScript `synthesize` command will implement the existing `runner: "uv"` branch by invoking that processor through `uv run --project ... --locked`. It will reuse `processorEnvironmentDir(name, runtimeVersion)` and `optionFlags`; no new processor abstraction is needed.

New projects will configure:

```json
{
  "tts": {
    "runner": "uv",
    "name": "qwen3-tts",
    "options": {
      "model": "Qwen/Qwen3-TTS-12Hz-0.6B-CustomVoice",
      "language": "Chinese",
      "speaker": "Vivian",
      "device": "auto"
    }
  },
  "align": {
    "runner": "uv",
    "name": "funasr",
    "options": { "model": "fa-zh", "device": "auto" }
  }
}
```

Their default `paths.media` will be `assets/input.wav` so the configured output extension matches the generated audio. Audio/video projects already replace `paths.media` with their actual source path.

## Data Flow

1. `yumoframe synthesize` reads inline text or `text.txt`.
2. The CLI invokes the bundled Qwen3-TTS uv processor with a temporary WAV path.
3. The processor downloads/caches the model through the upstream Hugging Face mechanism on first use, synthesizes with Vivian, and writes WAV.
4. YumoFrame atomically promotes the temporary file to `paths.media`.
5. Qwen3-TTS does not provide subtitle timestamps, so new projects use the default FunASR `fa-zh` processor to align the known source text to the audio without recognition. If `processors.align` is removed, `yumoframe transcribe` remains the manual ASR fallback.

## Error Handling

- Reject empty text through the existing TypeScript guard.
- Reject unsupported output formats in the Python CLI instead of writing WAV bytes under a misleading extension.
- Let model load and generation failures exit non-zero; the existing process runner surfaces the failed command.
- Resolve `device: auto` inside the processor, preferring CUDA, then Apple MPS, then CPU. Explicit device values override detection.
- Keep model, language, speaker, and instruction configurable through existing processor options.

## Documentation

Update both READMEs, architecture/development documentation, CLI help where needed, and the packaged authoring skill. Document Qwen3-TTS as the default and preserve a copy-paste edge-tts configuration as the lighter online alternative.

## Verification

- One Python unit test for argument/default handling and WAV writing with a mocked model; no model download.
- One Node test for the uv invocation, default model options, cached environment path, and new-project config.
- Run `mise exec -- pnpm build:cli`, `mise exec -- pnpm test`, the Qwen processor unit test, `mise exec -- pnpm typecheck`, `mise exec -- pnpm pack --dry-run`, and `git diff --check`.
- Do not run a model-download synthesis smoke test unless explicitly requested.

## Out of Scope

- Streaming synthesis
- Model pre-download or bundling weights in the npm package
- New timing heuristics or invented timestamps
