# Authoring pipeline (steps 4a / 4b)

Main checklist: [SKILL.md](../SKILL.md).

1. **`lines.json`** — breaks, highlights, width (**not** clocks for media)
2. **`storyboard.json`** — nest into `scenes[].lines` (text unchanged)

Fast width check: `node scripts/line-units.mjs --file lines.json`. Then `yumoframe validate`.

## Division of labor

| Who | Does |
|-----|------|
| AI 4a | `lines.json` text / breaks / highlights |
| AI 4b | `storyboard.json` scene tree |
| CLI | **align clocks from transcript** on resolve; validate; build `project.json` |

## lines.json

Media (no clocks):

```json
{
  "version": "0.1.0",
  "template": "comedy-text",
  "lines": [
    {"segments": [{"text": "校长知道我要", "highlight": false}, {"text": "复读", "highlight": true}]},
    {"segments": [{"text": "亲自给我打电话", "highlight": false}]}
  ]
}
```

### 4a rules

- No punctuation/spaces in `segments[].text`
- ≤6 units/line (CJK=1, ASCII=0.5)
- Highlight ≤35% of chars; highlight **inside** the line, never a duplicate word as its own line
- Lines with ≤2 units ≤25% of all lines
- Never split inside a word/number
- **Media: do not invent `start`/`end`** — `resolve` fills them from transcript
- Text-only: author final sequential global clocks

## storyboard.json

```json
{
  "version": "0.1.0",
  "template": "comedy-text",
  "endOverview": true,
  "scenes": [
    {
      "lines": [
        {"segments": [{"text": "校长知道我要", "highlight": false}, {"text": "复读", "highlight": true}]},
        {"segments": [{"text": "亲自给我打电话", "highlight": false}]}
      ]
    }
  ]
}
```

### 4b rules

- Each scene `lines.length` is 1–4 (prefer 3–4)
- If ≥8 scenes, average lines/scene ≥ 2.5
- Scene objects only contain `lines` (no camera/id)
- No top-level `lines`, no `sceneLock` / `sceneGroups`

## See also

- [style-guide.md](style-guide.md)
- [timing-rules.md](timing-rules.md)
- [examples.md](examples.md)
