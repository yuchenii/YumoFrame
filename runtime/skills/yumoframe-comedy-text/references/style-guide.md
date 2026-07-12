# Comedy Text Style Guide

## Palette and type

- Background: `#000000`
- Normal text: `#FFFFFF`
- Highlights: `#65F2A3`
- Heavy Chinese type (`fontWeight` 800–900 in render)
- Highlight character ratio must stay `≤ 35%` (validated)
- Do not make full sentences green

## Line budget

Author **one `lines[]` entry per visual row**. Runtime does not pack or merge rows.

Character units: CJK/other = `1`, ASCII (`[\x00-\xff]`) = `0.5`.

Hard ceilings (validated — **not targets**):

- ≤ **4** lines per scene (`lines.length`)
- ≤ **6** units per line (all segments on that line joined)
- **No punctuation or spaces** in `segments[].text` (strip `，。！？` etc.)
- Lines with ≤2 units ≤ **25%** of all lines (blocks one-char-per-line spam)
- With ≥8 scenes, average ≥ **2.5** lines/scene (prefer 3–4)
- Author in two steps: `lines.json` then nest into `scenes[].lines`
- Mix highlight inside a line with multiple `segments`

### Split by semantics (author rule)

**Prefer 3–4 lines per scene.** Adjacent scenes always rotate 90°, so 1–2 line scenes flip too often and text never settles. Group related beats into one scene until you have ~3–4 lines, then start a new scene.

- Target **3–4 lines** per scene; 1–2 only for a rare isolated punch with enough hold time
- Do **not** pack every line to 5–6 units — short phrases (2–4 units) are fine
- Prefer a new scene at a joke turn / speaker change / clear pause **after** the current scene already has ~3–4 lines
- Prefer a new line at a natural phrase break — even if the previous line has spare units
- If content needs a 5th line, **new scene** — do not merge lines to stay under 4. CLI validate will say so explicitly.

Bad packing:

- Most scenes stuck at 1–2 lines (frantic rotation)
- Lines padded to 5–6 units when a 2–4 unit phrase would read better
- Unrelated clauses glued together with no semantic link
- Filler lines invented only to reach 4

### Split on words / phrases (author rule)

**Never cut inside a Chinese word or fixed phrase.** Group whole words/phrases into a row; if the next word would exceed the hard max (6), start a new row (or a new scene). Do **not** keep adding words just because there is room under 6.

**Author order:** semantic tokens → highlight whole tokens → pack into ≤6-unit lines. Do **not** pack from raw ASR segment boundaries first — ASR often breaks mid-number (`六百` / `二是…`).

Applies to **every** authoring path — pure text, ASR/transcript + audio, and TTS rewrite. Timing alignment must not excuse character-greedy packing.

Good:

- `我说` / `我不记得` (not `我说我不记` / `得`)
- `状元` / `是傻子` (not `知道他的状` / `元是傻子`)
- `理由` kept whole (not `就编了个理` / `由`)
- `985录取` / `程序` (not `我们985录` / `取程序`)
- `六百二` kept whole even when ASR was `六百。` + `二是…`
- Short punch alone on its line: `甘心吗` / `装呢` / `膨胀`

Bad: any line break that splits a word mid-morpheme (`记|得`, `状|元`, `理|由`, `录|取`, `经|历`, `复|杂`, `六百|二`, …).

When a single word is longer than 6 units (rare), keep it on its own line and shorten elsewhere — do not bisect it.

Typewriter: characters inside a line reveal one-by-one from `start`, max `0.18s` per character; longer `end` means hold after the line is fully typed.

## Camera and layout intent

Hard (validated):

- `camera.rotate` is only `0`, `-90`, or `90`
- Adjacent scenes must change by exactly 90°
- Do not hand-place `x` / `y` / `targetX` / `targetY`; leave them `0` and let auto-layout run

Soft:

- Prefer a **fixed element `fontSize`** across scenes (e.g. `128`). Framing variation comes from camera fit-scale.
- Optional per-line `fontSize` / `fontWeight`; omit → light auto (≤2 units ×1.18, ≤4 ×1.08, else ×1.0; weight 900). Keep auto light so it does not fight the camera.
- Runtime **camera fit-scale** zooms to the **active line** (not the whole scene stack): short lines push in, long lines pull out (`scale` ≈ `0.85–2.0`, ~11% padding). Leave `camera.scale` at `1`.
- Prefer opening beat and final punchline on `rotate: 0` when the adjacent-90° chain allows it
- `-90`: text becomes left-aligned; next block attaches on the right
- `90`: text becomes right-aligned; next block attaches on the left
- `0`: horizontal; auto-layout uses right align
- Scene changes should feel like canvas rotations, not free panning
- Rotate the existing canvas first; reveal the new beat in the next scene window
- Once text appears, keep it visually unchanged — no fade or dim of old text
- Keep active text near the camera center; old text may sit near edges without covering the active beat

## See also

- [authoring-pipeline.md](authoring-pipeline.md) — `lines.json` / `storyboard.json` shapes
- [timing-rules.md](timing-rules.md) — clocks and typewriter hold
- [examples.md](examples.md) — good/bad samples
- Run `yumoframe validate` for hard checks.
