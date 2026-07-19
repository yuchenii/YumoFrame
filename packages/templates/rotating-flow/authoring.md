# Rotating Flow authoring

Author ordered kinetic text as `scenes[].lines[]`. Use `lines.json` as the flat line-break/highlight layer, then copy those lines unchanged into `storyboard.json` scene groups. `project.json` is generated and must not be edited.

## Input contract

Each line contains `segments`, each with non-empty `text` and boolean `highlight`. For media or TTS, omit `start` and `end`; `yumoframe resolve` aligns them from the reviewed `transcript.json`. For text-only input, provide sequential global seconds with `end > start`.

Example line:

```json
{
  "segments": [
    { "text": "文字开始", "highlight": false },
    { "text": "流动", "highlight": true }
  ]
}
```

Example Storyboard:

```json
{
  "version": "0.1.0",
  "template": "rotating-flow",
  "endOverview": true,
  "scenes": [
    {
      "lines": [
        {
          "segments": [
            { "text": "文字开始", "highlight": false },
            { "text": "流动", "highlight": true }
          ]
        },
        { "segments": [{ "text": "镜头跟着转", "highlight": false }] }
      ]
    }
  ]
}
```

## Line rules

- Remove punctuation and spaces from displayed text.
- Keep each line at 8 visual units or fewer: CJK/other = 1, ASCII = 0.5.
- Break on semantic word/phrase boundaries; never split a word, fixed phrase, or number.
- Highlight whole important words, numbers, or punch lines inside the same line.
- Keep highlighted characters at or below 35%; do not make full sentences green.
- Lines of 2 units or fewer may be at most 25% of all lines.
- Do not pad lines to the limit; natural 2–4 unit phrases are often better.
- Font size is fit to the content column (max ≈3 CJK chars at full size) so longer lines still fit with side margin.

Good: `文字开始` / `流动`, `985录取` / `程序`, and keeping `六百二` whole.

Bad: `流动。`, `六百` / `二是我们学校`, one character per line, or duplicating a highlighted word as another line.

Run `yumoframe validate` for authoritative width, punctuation, highlight, and tiny-line checks.

## Scene grouping

- Use 1–4 lines per scene; prefer 3–4 related lines.
- Start a scene at a joke turn, speaker change, or clear pause after the current beat has enough lines.
- If there are 8 or more scenes, average at least 2.5 lines per scene.
- Scene objects contain only `lines`; do not author IDs, cameras, elements, `sceneLock`, or `sceneGroups`.
- Avoid repeated one-line scenes: every scene rotates the canvas by 90 degrees.

## Timing and playback

- Media/TTS timing comes only from `transcript.json`; never invent it.
- Text-only timing is global seconds, non-decreasing, and each `end` is after `start`.
- A comfortable text-only reveal is roughly 0.06–0.18 seconds per character plus hold.
- Preserve the original extracted voice track for playback.
- Leave the default end overview enabled unless the user asks to remove it.

## Generated layout

`resolve` computes element coordinates, width, rotations, and camera targets once and writes them to `project.json`. Do not hand-author `x`, `y`, `width`, `targetX`, `targetY`, or rotation chains. Studio, Render, and the SVG layout preview consume the same resolved values.

## Review flow

1. Author and validate `lines.json`.
2. Group the unchanged lines into `storyboard.json`.
3. Run `yumoframe resolve` and inspect alignment warnings.
4. Review `project.md`; if edited, run `yumoframe sync project`.
5. Run `yumoframe validate`, then review `yumoframe studio` before rendering.
