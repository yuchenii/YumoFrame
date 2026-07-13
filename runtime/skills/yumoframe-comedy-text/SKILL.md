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
- [ ] For TTS: synthesized voice track; transcript derived or transcribe fallback run
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

For **text-to-speech** (make a voiced video from text), write the script to `text.txt` and synthesize. This uses `processors.tts` and, when the engine can, derives timing without ASR:

```bash
# Write text.txt (one script; punctuation is fine — it shapes prosody).
yumoframe synthesize          # or: yumoframe tts
```

`synthesize` writes the voice track to `paths.media`. Read its output:

- **"Wrote … transcript.json (timing derived …)"** — timing came from TTS subtitles or forced alignment. Treat exactly like media: proofread `transcript.md`, author lines/storyboard **without clocks**, `resolve`.
- **"Audio only; run yumoframe transcribe …"** — the engine gave audio only and no `processors.align` is set. Run `yumoframe transcribe` next, then proceed as media.

Do not hand-write clocks for TTS; timing still comes only from `transcript.json`.

For **text-only** input, skip audio entirely and author sequential global `start`/`end` seconds. Use roughly 0.06–0.18 seconds per character plus a short hold; keep every `end > start`.

## 2. Proofread transcript (media or TTS)

Edit only `校对：` lines in `transcript.md`:

- Fix ASR homophones, word breaks, and obvious recognition errors.
- For TTS-derived transcripts the text already matches `text.txt`, so this pass is mostly confirmatory — just fix any odd segmentation.
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
| TTS made audio but no `transcript.json` | run `yumoframe transcribe`, or set `processors.align` for forced alignment |
| TTS voice/quality wrong | `text.txt` and `processors.tts` (voice/model/provider) in config |
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
