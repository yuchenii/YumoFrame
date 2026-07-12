# Examples (line breaks)

Units: CJK = 1, ASCII = 0.5. Max **6** per line. Check with:

```bash
node scripts/line-units.mjs --check '<text>'
```

## Good

| Line text | Units | Why |
|-----------|-------|-----|
| `校长知道我要` | 6 | Full phrase, at ceiling |
| `复读` | 2 | Punch alone OK if rare |
| `六百二` | 3 | Number kept whole |
| `我的高考` | 4 | Natural phrase |
| `985录取` | 5.5 | ASCII half-width + CJK |

```json
{"start": 0.37, "end": 1.13, "segments": [
  {"text": "校长知道我要", "highlight": false}
]}
```

```json
{"start": 1.13, "end": 1.39, "segments": [
  {"text": "复读", "highlight": true}
]}
```

## Bad

| Line text | Problem |
|-----------|---------|
| `超过六个中文字` | 7 units — split at phrase boundary |
| `复读。` | Punctuation forbidden |
| `六百` then `二是我们学校` | Mid-number split |
| `我` / `的` / `高` / `考` each alone | Tiny-line spam |
| One scene per single character | Fragmented scenes |

## Scene packing

**Good** — one scene, 3–4 related lines:

```json
{
  "lines": [
    {"start": 0.0, "end": 0.8, "segments": [{"text": "校长知道我要", "highlight": false}]},
    {"start": 0.8, "end": 1.2, "segments": [{"text": "复读", "highlight": true}]},
    {"start": 1.2, "end": 2.0, "segments": [{"text": "亲自给我打电话", "highlight": false}]}
  ]
}
```

**Bad** — three scenes of one short line each (frantic rotate).
