---
name: yumoframe-comedy-text
description: Create and revise YumoFrame comedy-text kinetic videos from Chinese text, audio, video, or text-to-speech. Use for the complete reviewed workflow across yumoframe init/synthesize/transcribe/sync/resolve/validate/studio/render and when editing transcript.md, lines.json, storyboard.json, or project.md. Preserve original media audio, synthesize a voice track from text when asked, align authored lines to reviewed/derived transcripts, and require explicit preview approval before rendering.
---

# YumoFrame Comedy Text

Require the installed `yumoframe` CLI. Never hand-write `project.json`.

Author in two passes: `lines.json` for line breaks, then `storyboard.json` for `scenes[].lines` grouping.

## Mandatory gates

Stop after showing each human file:

1. Edit and show `transcript.md`; continue only after the user confirms it.
2. Resolve, show `project.md`; continue only after the user confirms it.
3. Open `yumoframe studio`; render only after the user explicitly approves the preview.

Never silently chain validate, studio, and render.

## File ownership

| File | Owner | Purpose |
|------|-------|---------|
| `transcript.json` | CLI | ASR text and timestamps |
| `transcript.md` | AI + user | Correct `校对：` text without changing clocks |
| `lines.json` | AI | Flat breaks + highlights — **no clocks for media** |
| `storyboard.json` | AI | `scenes[].lines` grouping — **no clocks for media** |
| `project.md` | AI + user | Review scenes/text/highlights |
| `project.json` | CLI | Runtime; never edit |

**Timing:** if `transcript.json` exists, `yumoframe resolve` **auto-aligns** line `start`/`end` from it (produced by `transcribe`, or by `synthesize` via TTS subtitles / forced alignment). AI must not invent clocks. Highlight inside a line with multiple segments — never duplicate a word as a second line (breaks align).

In `project.md`, edit only scene grouping, bullet text, and `**highlight**` spans. Heading clocks and `rotate` are generated display data and are not parsed back by `sync project`.

## Checklist

```text
- [ ] Input type and destination confirmed (text / text-to-speech / audio / video)
- [ ] Project initialized; media placed at config.paths.media, or text.txt written for TTS
- [ ] For TTS: capabilities reviewed; `speech.json` shown and confirmed; synthesized voice track timing checked
- [ ] transcript.md proofread and confirmed for media/TTS input
- [ ] lines.json authored and checked
- [ ] storyboard.json grouped without rewriting lines
- [ ] resolve completed; project.md shown and confirmed
- [ ] validate clean
- [ ] studio preview reviewed
- [ ] user explicitly approved render
```

## 1. Initialize and place input

```bash
yumoframe init <slug> --template comedy-text
cd <slug>
```

For **audio/video**, copy the source into `assets/` with its real extension and set `paths.media` in `yumoframe.config.json` to that relative path. Do not overwrite a real source file with generated TTS.

```bash
cp /absolute/path/input.mp3 assets/input.mp3
# Set paths.media to "assets/input.mp3".
yumoframe transcribe
```

`transcribe` writes `transcript.json`, `transcript.md`, and the extracted original voice at `paths.voice`.

For **text-to-speech** (make a voiced video from text), write the exact script to `text.txt`. Every voiced comedy-text project must use a reviewed `speech.json`; never recommend or run bare `yumoframe synthesize` from this Skill. The bare CLI path remains only for backward compatibility outside this workflow.

1. Read `yumoframe.config.json`, especially `processors.tts`, `paths.media`, `paths.voice`, and `paths.ttsText`, then run the read-only capability command:

   ```bash
   yumoframe synthesize --capabilities
   ```

2. Show `selected` (runner/provider, processor, model, profile, language, speaker/voice, device) before recommending anything. Use only `available.models`, `available.voices`, and `profile` from that output; never maintain or guess a separate model/voice list in this Skill.
   - If the user supplied only a size/family such as `1.7B`, show matching available variants and ask them to choose the use case.
   - If the chosen profile uses a preset speaker and none was specified, show `available.voices` with descriptions and ask for one.
   - If the profile requires voice design, reference audio/text, API voice, or other config, request exactly the fields reported by capabilities.
   - Inspect GPU/MPS only while comparing local model sizes. Skip hardware checks for `api` and `command` runners.
3. Update `yumoframe.config.json`, rerun `--capabilities`, and show the final `selected` setup. Do not download or synthesize before the user confirms it.
4. Mechanically split the exact source into short immutable delivery units. The helper preserves every character and cuts at sentence/clause punctuation, including commas, colons, semicolons, and dashes:

   ```bash
   node /path/to/this-skill/scripts/split-speech.mjs "$PWD/text.txt"
   ```

5. Inspect the units before assigning delivery. If one is still long or contains an internal change of speaker, emotion, emphasis, or pace, split it again at the exact semantic boundary without adding, deleting, or moving any character. Do not merge adjacent units just because their initial delivery looks similar.
6. Create `speech.json` for every TTS project. Keep one atomic unit per segment so an expressive long sentence cannot accumulate timing drift internally. Assign each segment an engine-neutral `intent`, then compile exactly one `control` allowed by `profile.controls` / `profile.controlOptions`. Default `pauseAfterMs` to `0`; add it only when the user wants extra silence beyond the punctuation's natural pause. Never invent unsupported fields or silently discard delivery intent.
7. Verify that concatenating all `segments[].text` exactly reproduces the configured source, including whitespace and final newline. Show the complete plan and stop. If the selected profile cannot run multiple segments or express the requested controls, ask the user to switch to a compatible model/provider; do not bypass the plan with whole-text synthesis.
8. Only after explicit plan approval:

   ```bash
   yumoframe synthesize --plan speech.json
   ```

The CLI generates ordered fragments, aligns each fragment independently, then offsets its timestamps by the real preceding fragment durations and `pauseAfterMs`. It never estimates clocks from character counts. Local plan-aware processors load the model once; online providers may make ordered requests.

Read the JSON result from `synthesize` and show its `tts`, `duration`, `timingMode`, `lastTimestamp`, `coverage`, and `reviewRequired` fields:

- `fragment-align`: inspect `coverage`, spot-check the last segment against playback, then show `transcript.md` for confirmation.
- `asr-fallback`: timing came from recognizing the final audio; `reviewRequired` must be true. Proofread the spoken text before continuing.
- `audio-only`: run `yumoframe transcribe` before continuing.
- `whole-align`: valid CLI compatibility output, but it indicates this Skill skipped the mandatory plan; stop and correct the workflow.

`synthesize` automatically updates both `paths.media` and `paths.voice` to the actual generated project-local file. Do not copy the file or hand-edit those paths. Do not hand-write TTS clocks; `transcript.json` remains the only timing source.

For **text-only** input, skip audio entirely and author sequential global `start`/`end` seconds. Use roughly 0.06–0.18 seconds per character plus a short hold; keep every `end > start`.

## 2. Proofread transcript (media or TTS)

Edit only `校对：` lines in `transcript.md`:

- Fix ASR homophones, word breaks, and obvious recognition errors.
- For the mandatory TTS plan, `timingMode` should normally be `fragment-align`. Matching `text.txt` alone is not proof of correct timing: compare `duration`, `lastTimestamp`, and `coverage`, then spot-check at least the final delivery unit against playback.
- Forced-aligned TTS should appear as clause-sized review sections while retaining character timestamps. A whole script in one section, a large uncovered tail, or visibly late/early final text indicates a timing failure; fix or regenerate alignment instead of asking the user to approve a matching text blob.
- Leave `校对：` empty for non-speech/noise segments that should be dropped.
- Preserve headings, clocks, and `原文：` text.
- Do not add performance line breaks or highlights yet.

Show the edited file and stop. After user confirmation:

```bash
yumoframe sync transcript
```

## 3. Author `lines.json`

Break the reviewed text into semantic rows. Strip punctuation and spaces, keep words/numbers intact, and highlight at most 35% of characters.

**Media / TTS:** omit `start`/`end` (or leave anything). CLI overwrites clocks on `resolve` from transcript.  
**Text-only:** author sequential global clocks (~0.06–0.18s per char + hold).

Highlight as in-line segments, e.g. one line `校长知道我要` + `复读`(highlight) — **not** a separate line that repeats `复读`.

```bash
node /path/to/this-skill/scripts/line-units.mjs --file "$PWD/lines.json"
yumoframe validate
```

Use the bundled script for fast width/tiny-line feedback. Treat `yumoframe validate` as authoritative for all constraints.

Read [references/authoring-pipeline.md](references/authoring-pipeline.md) before authoring these files.

## 4. Group `storyboard.json`

Copy the completed lines unchanged into `scenes[].lines`:

- Use 1–4 lines per scene; prefer 3–4.
- Cut at a joke turn, speaker change, or clear pause.
- Keep scene objects limited to `lines`; do not add camera/id fields.
- Do not keep top-level `lines`, `sceneLock`, or `sceneGroups`.

## 5. Resolve and review `project.md`

```bash
yumoframe resolve
# Media / TTS: auto-aligns from transcript.json when present
# Text-only / keep manual clocks: yumoframe resolve --no-align
```

Inspect every `align miss` / overlap warning. Fix named line text or transcript 校对 (often: duplicated highlight words, mid-word cuts), then rerun. Do not invent new clocks by hand.

Show `project.md` and stop. After user confirmation:

- If unchanged, continue to validation.
- If edited, run `yumoframe sync project`. When `transcript.json` exists, this rebuilds and realigns timing.

## 6. Validate and preview

```bash
yumoframe validate
yumoframe studio
```

Fix until validation prints `OK`. Studio also runs validation and will refuse invalid data.

Show/open the studio preview and stop. Apply requested changes at the owning layer, resolve/sync again, and repeat validation.

## 7. Render only after approval

After the user explicitly approves the preview:

```bash
yumoframe render
```

Render validates again before starting Remotion.

## Failure routing

| Failure | Return to |
|---------|-----------|
| Missing/poor ASR text | media path, `transcribe`, or `transcript.md` |
| TTS result is `audio-only` or has no `transcript.json` | run `yumoframe transcribe`; do not continue from guessed clocks |
| TTS result is `asr-fallback` | proofread the actual recognized delivery in `transcript.md`; text equality with `text.txt` is not assumed |
| TTS result is `whole-align` | the Skill skipped mandatory `speech.json`; return to the TTS plan step |
| TTS voice/quality wrong | `text.txt` and `processors.tts.options` (`model`, `speaker`, `instruct`, `refAudio`, `refText`) in config |
| VoiceDesign says `instruct` is required | add a concrete voice/style description after user approval |
| Base says `ref-audio` is required | set a project-relative reference audio path; add matching `refText` for better quality |
| Width, punctuation, highlight, or tiny-line error | `lines.json` |
| Too many/few lines per scene | `storyboard.json` grouping |
| `align miss` / overlap warning | duplicated highlight line, mid-word cut, or transcript 校对 |
| Wrong clocks on media | do not hand-edit — fix text then `resolve` (auto-align) |
| Wrong wording/grouping after review | `project.md` then `sync project` |
| Missing audio/project asset | `yumoframe.config.json` paths and `assets/` |

## References

- [references/authoring-pipeline.md](references/authoring-pipeline.md)
- [references/style-guide.md](references/style-guide.md)
- [references/timing-rules.md](references/timing-rules.md)
- [references/examples.md](references/examples.md)
