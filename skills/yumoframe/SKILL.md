---
name: yumoframe
description: Create and revise YumoFrame videos from text, audio, video, or text-to-speech with the installed yumoframe CLI. Use for the reviewed workflow across init, inspect, synthesize, transcribe, sync, resolve, validate, studio, and render; for editing template authoring files described by inspect; and for preserving original media audio, deriving timing from transcripts, and requiring explicit Studio approval before rendering.
---

# YumoFrame

Require the installed `yumoframe` CLI. Never hand-write generated `project.json`.

## Start by inspecting the active Template

For an existing project, run:

```bash
yumoframe inspect --json
```

Read the returned Manifest, Guide, Storyboard/Project Schemas, default Storyboard, and capabilities before authoring. Treat the Guide and Schemas as authoritative. Do not assume one Template's fields, file layers, or visual rules apply to another.

For a new project, list the installed Templates, initialize the selected exact ID, then inspect it:

```bash
yumoframe templates --json
yumoframe init <slug> --template <template-id>
cd <slug>
yumoframe inspect --json
```

## Mandatory gates

Stop after each human review surface:

1. For media or TTS, show `transcript.md`; continue only after confirmation.
2. Resolve and show the Template's review artifact when it provides one, such as `project.md`; continue only after confirmation.
3. Open `yumoframe studio`; render only after explicit preview approval.

Never silently chain validate, Studio, and render.

## Ownership and timing

- Treat `transcript.json` and `project.json` as CLI-generated files.
- Edit only `校对：` lines in `transcript.md`; preserve headings, clocks, and `原文：`.
- Author only the files and fields named by `inspect --json`.
- When `transcript.json` exists, let `resolve` derive author timing from it. Never invent media/TTS timestamps.
- Preserve the original extracted voice track for media playback.
- Apply wording, grouping, or emphasis changes at the owning authoring layer, then resolve again.

## Workflow checklist

```text
- [ ] Input type and destination confirmed
- [ ] Project initialized and inspect --json reviewed
- [ ] Media placed at config.paths.media, or exact TTS source written
- [ ] For TTS: capabilities and speech.json reviewed before synthesis
- [ ] transcript.md proofread and confirmed for media/TTS
- [ ] Template authoring files created from the returned Guide and Schemas
- [ ] resolve completed; review artifact shown and confirmed when supported
- [ ] validate clean
- [ ] Studio preview reviewed
- [ ] user explicitly approved render
```

## Input routes

### Audio or video

Copy the source into `assets/` with its real extension, set `paths.media` to the project-relative path, then run:

```bash
yumoframe transcribe
```

This writes `transcript.json`, `transcript.md`, and the extracted original voice at `paths.voice`.

### Text to speech

Write the exact source to the configured `paths.ttsText`. Every voiced project created through this Skill uses a reviewed `speech.json`; do not bypass the plan with bare whole-text synthesis.

1. Read `yumoframe.config.json`, then run `yumoframe synthesize --capabilities`.
2. Show `selected` and use only the returned models, voices, requirements, profile controls, and control options. Do not maintain or guess a separate catalog.
3. Update config when needed, rerun capabilities, and stop for setup confirmation before downloading or synthesizing.
4. Run the bundled `scripts/split-speech.mjs` against the configured source file to produce short immutable delivery units.

5. Further split any unit with an internal speaker, emotion, emphasis, or pace change. Do not add, delete, move, or rewrite source characters.
6. Create one `speech.json` segment per atomic unit. Assign engine-neutral `intent`, exactly one supported `control`, and `pauseAfterMs: 0` unless extra silence is requested.
7. Verify concatenated segment text exactly reproduces the source. Show the complete plan and stop.
8. After explicit approval, run `yumoframe synthesize --plan speech.json`.

Show the result's `tts`, `duration`, `timingMode`, `lastTimestamp`, `coverage`, and `reviewRequired`:

- `fragment-align`: check coverage and spot-check the final unit against playback.
- `asr-fallback`: proofread the recognized delivery; review is mandatory.
- `audio-only`: run `yumoframe transcribe` before authoring.
- `whole-align`: stop; the mandatory reviewed plan was skipped.

Do not copy the generated voice file or hand-edit its clocks. The CLI updates `paths.media` and `paths.voice`; `transcript.json` remains the timing source.

### Text only

Skip audio and follow the active Template Guide. Supply explicit timing only when its Schema and Guide require it.

## Transcript review

For media or TTS:

- Fix homophones, word breaks, and recognition errors in `校对：`.
- Leave `校对：` empty for non-speech segments to drop.
- For aligned TTS, compare duration, last timestamp, and coverage, then spot-check playback.
- Treat a whole script in one section, a large uncovered tail, or visibly late/early final text as alignment failure.

Show `transcript.md` and stop. After confirmation:

```bash
yumoframe sync transcript
```

## Author, resolve, and review

Follow the Template Guide and Schemas returned by `inspect --json`. Use the default Storyboard as the structural starting point. Run `yumoframe validate` while authoring; treat it as authoritative.

Then run:

```bash
yumoframe resolve
```

For text-only projects whose Template accepts manual clocks, use `yumoframe resolve --no-align` when appropriate. Inspect every alignment warning and fix text or transcript corrections rather than timestamps.

If the Template exposes project Markdown sync, show `project.md` and stop. After confirmation, run `yumoframe sync project` only when the user edited that file.

## Validate and preview

```bash
yumoframe validate
yumoframe studio
```

Fix validation errors at the owning input layer. Open the Studio preview and stop. Repeat authoring, resolve, and validation after requested changes.

## Render only after approval

After explicit preview approval:

```bash
yumoframe render
```

## Failure routing

| Failure                                 | Return to                                    |
| --------------------------------------- | -------------------------------------------- |
| Missing or poor speech text             | media path, `transcribe`, or `transcript.md` |
| `audio-only` or missing transcript      | `yumoframe transcribe`                       |
| `asr-fallback`                          | proofread actual recognized delivery         |
| `whole-align`                           | create and approve `speech.json`             |
| Voice or quality mismatch               | capabilities, TTS config, and speech plan    |
| Template validation error               | active Guide, Schema, and authoring files    |
| Alignment warning or wrong media clocks | text/transcript correction, then `resolve`   |
| Wrong wording or grouping after review  | Template review layer, then supported sync   |
| Missing asset                           | config paths and `assets/`                   |
