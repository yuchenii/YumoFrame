# Timing Rules

Line times are **global seconds**.

## Hard constraints (validated or required for correct playback)

- Each line: non-empty `segments`, `end > start`
- Each segment: non-empty `text`, boolean `highlight`
- Line starts are non-decreasing within an element (`start >= previous line end`)
- Scene order: `start >= previous.end`, `end > start`
- Scene `start`/`end` define the camera / active-scene window; lines should generally track that beat, but small bleed past `scene.end` is OK
- `composition.duration` must be greater than the last line `end`
- If `endOverview !== false` (default on), leave roughly `≥ 1.35s` after the last scene `end` for overview delay (~0.35s) + zoom (~1s)

Typewriter: within a line, characters reveal one-by-one from `line.start`. Per-character step is `min((end-start)/charCount, 0.18s)`. If the line window is longer than that, leftover time is a **hold** with the full line visible (not a slower typewriter).

## Soft rhythm (not enforced by `yumoframe validate`)

- Comfortable per-character pace is about `0.06`–`0.18s`; runtime hard-caps at `0.18s`
- Punchlines may use a long `end` for hold after typing finishes
- Prefer ~3–4 lines per scene so camera rotations have room to breathe; ≤4 lines / ≤6 units are ceilings — do not pack lines to fill units

## See also

- [style-guide.md](style-guide.md)
- [authoring-pipeline.md](authoring-pipeline.md)
- [examples.md](examples.md)
