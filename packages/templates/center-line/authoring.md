# Center Line authoring

Author a flat `lines[]` sequence. Do not add `scenes`, camera data, or a virtual canvas.

Each line requires a unique `id` and non-empty `text`. `emphasis` is an optional array of exact substrings already present in `text`.

For media or TTS, omit `start` and `end`; `yumoframe resolve` aligns each line from the reviewed `transcript.json`. For text-only work, provide non-overlapping global seconds with `end > start`.

```json
{
  "version": "0.1.0",
  "template": "center-line",
  "lines": [
    { "id": "line-001", "text": "第一句话", "start": 0, "end": 1.4, "emphasis": [] },
    { "id": "line-002", "text": "第二句话", "start": 1.4, "end": 3.1, "emphasis": ["第二句"] }
  ]
}
```

`minimal-dark` shows only the active centered line. `echo` keeps up to four prior lines as progressively fainter history. Switching Preset never changes the line data.

An optional top-level `style` object may override visual fields such as `fontSize`, `background`, or `emphasisColor`. Resolution order is template defaults, selected Preset, then Storyboard `style`; the complete resolved style is written to `project.json`.

Run `yumoframe resolve`, `yumoframe validate`, and then review Studio before rendering. `project.json` is generated and must not be edited.
