# Segmented TTS Delivery Design

## Goal

Require the authoring Skill to turn `text.txt` into a reviewable, model-aware speech plan whose short clause-level units can use different delivery. Generate all units without repeatedly loading a local model, align each generated fragment independently, then merge them into one voice track.

The bare CLI remains backward compatible: without a speech plan, `yumoframe synthesize` continues to synthesize the whole source text once. The packaged comedy-text Skill must not use that compatibility path for voiced TTS projects.

## Sources of Truth

- `yumoframe.config.json` selects the TTS runner, provider/processor, model, speaker or reference voice, device, and global engine options.
- `text.txt` is the canonical spoken text.
- `speech.json` is mandatory in the comedy-text Skill's voiced TTS workflow and describes how the canonical text should be performed. It remains optional only for direct CLI compatibility.
- `transcript.json` remains the generated timing source. A speech plan never invents timestamps.

Model selection must not be copied into `speech.json`. Switching models changes the executable controls, not the canonical text or its semantic analysis.

## Speech Plan

`speech.json` stores a reusable semantic intent and a tagged, model-specific control for each final delivery section:

```json
{
  "version": "0.1.0",
  "source": "text.txt",
  "voice": {
    "description": "A young, natural Mandarin female voice whose identity stays consistent"
  },
  "segments": [
    {
      "id": "s1",
      "text": "刚开始，我还以为这件事很简单。",
      "intent": {
        "emotion": "calm",
        "intensity": 0.3,
        "pace": "slow",
        "note": "像在轻松回忆一件往事"
      },
      "control": {
        "type": "qwen-instruct",
        "instruct": "平静自然，语速稍慢，像在轻松回忆一件往事"
      },
      "pauseAfterMs": 180
    },
    {
      "id": "s2",
      "text": "结果第二天，我直接傻眼了！",
      "intent": {
        "emotion": "surprised",
        "intensity": 0.8,
        "pace": "fast",
        "note": "重读“傻眼了”"
      },
      "control": {
        "type": "qwen-instruct",
        "instruct": "从平静突然转为明显惊讶，后半句加快语速，重读“傻眼了”"
      },
      "pauseAfterMs": 0
    }
  ]
}
```

`intent` is engine-neutral authoring information and is never passed directly to a TTS engine. `control` is the executable representation compiled for the active model. When the model changes, the Skill keeps the text and intent and regenerates only the control.

Segments are short immutable delivery units cut at natural sentence and clause boundaries, including commas, colons, semicolons, dashes, and line breaks. If a unit still changes speaker, emotion, emphasis, or pace internally, split it again at the exact source character boundary. Do not merge adjacent units merely because their delivery is similar: expressive pace and pauses can vary inside a long sentence, and a long fragment allows timing drift to accumulate. Concatenating every `segments[].text` value in order must reproduce the source text exactly, including punctuation and boundary whitespace.

The engine-neutral intent has a deliberately small contract: `emotion` is a non-empty descriptive string, `intensity` is in `[0, 1]`, `pace` is `slow`, `normal`, or `fast`, and `note` is an optional human-readable performance detail. Profiles may use only the subset they can represent; unsupported intent must be reported before control compilation rather than silently discarded. `pauseAfterMs` is an integer from `0` through `10000`, including on the final segment when trailing silence is intentional.

## Model-Specific Controls

The speech schema uses a tagged union. Each control type has its own fields and validation:

| Profile | Control | Rules |
|---|---|---|
| Qwen3-TTS CustomVoice | `qwen-instruct` | Non-empty `instruct`; preset `speaker` remains in project config |
| Qwen3-TTS VoiceDesign | `qwen-voice-design` | Non-empty `instruct`; the Skill combines the stable `voice.description` with the segment intent in every section |
| Qwen3-TTS Base | `none` | No delivery instruction; reference audio/text remain in project config |
| IndexTTS2 | `indextts2-emo-text` | `emoText` plus `emoAlpha` in `[0, 1]` |
| IndexTTS2 advanced | `indextts2-emo-vector` | Exactly eight values in the documented emotion order, each in `[0, 0.8]` |
| IndexTTS2 reference | `indextts2-emo-audio` | Project-relative emotion reference audio plus `emoAlpha` |
| edge-tts | `edge-prosody` | Signed `rate`/`volume` percentages and signed `pitch` Hz; no natural-language instruction |
| Known online API | profile-specific API control | Only fields explicitly allowed by that provider/model profile |
| Unknown API or command | `none` | Whole-text synthesis unless an explicit known profile is configured |

Unsupported controls are errors, never silently ignored. A non-neutral intent paired with a `none`-only profile must be resolved by using a neutral clause-level plan or switching engines before generation.

Adding an IndexTTS2 processor is not part of this change. Its profile and control contract are defined so that a future processor fits the same plan without changing `speech.json` semantics.

## Shared TTS Profiles

Code and Skill must not maintain independent capability tables. A packaged machine-readable profile registry at `runtime/processors/tts-profiles.json` is the shared source for:

- matching runner, processor/provider, and model;
- execution mode: `native-batch`, `persistent-loop`, `sequential`, or `single`;
- accepted control types;
- required global configuration;
- timing behavior;
- per-control formats and limits.

Bundled Qwen profiles resolve from `runner: "uv"`, `name: "qwen3-tts"`, and the model suffix. Known API profiles resolve from provider and model. A command runner must explicitly select a packaged profile such as `edge-tts`; command text is not inspected heuristically. Unknown configurations resolve conservatively to `single + none`.

`Processor` gains an optional `profile` string for explicit selection. Bundled uv processors normally resolve it automatically. Command and custom API runners must set it before a segmented plan can use anything beyond `none`; the value selects only a packaged profile and cannot inject an arbitrary schema.

`yumoframe synthesize --capabilities` exposes the resolved profile as JSON without loading or downloading a model. The Skill calls this command before creating executable controls, so it consumes the same resolver and constraints as runtime validation.

## Plan Authoring Flow

The Skill creates the plan in three passes:

1. A deterministic helper splits `text.txt` into immutable atomic delivery units using sentence punctuation, clause punctuation, quotes, and line breaks while preserving every source character.
2. The agent analyzes the global narrative arc and assigns engine-neutral intent to every unit without regrouping units into longer segments.
3. The agent reads `synthesize --capabilities`, compiles each intent into an allowed model-specific control, and validates the finished plan.

The Skill then shows the proposed `speech.json` and stops. It may run synthesis only after user approval. It must never change wording while adding delivery, invent fields absent from the resolved profile, or silently downgrade unsupported intent.

If a model is already configured, the existing Skill rule still applies: show it and ask whether to keep it before changing configuration or downloading weights. If the user switches models after approving a plan, preserve segment text and intent, regenerate controls, validate again, and request approval again.

## Execution Model

Local multi-segment synthesis must not launch one Python model process per segment.

- Qwen3-TTS runs one uv worker, loads the model once, uses its native list-valued batch API, and writes one temporary audio fragment per segment.
- A future IndexTTS2 worker loads one model instance and loops over its single-text `infer` method inside that same process.
- Online APIs issue ordered per-segment requests because generic batch support cannot be assumed.
- Command processors run sequentially. A command profile known to incur expensive model startup should reject segmented execution and recommend a plan-aware processor or a user-managed local API service.

A long-running YumoFrame-managed daemon is out of scope. Users who already run a local OpenAI-compatible TTS service can use the existing API runner with a localhost `baseUrl`. A managed daemon should be considered only if repeated synthesis commands show that cross-command model reload latency is a real problem.

All execution modes produce ordered temporary fragments. TypeScript owns normalization, silence insertion, and concatenation through the existing ffmpeg dependency. The target voice track is replaced atomically only after every fragment and the final merge succeed. Temporary fragments are removed on success or failure.

## Timing

Timing uses the following priority order:

1. If every fragment has native timing metadata, offset each fragment's timing by its merged start time and combine it into one transcript.
2. Otherwise run the configured FunASR forced aligner once as a process, but align every fragment independently inside it. Validate each fragment, then offset its timestamps by the actual preceding fragment durations plus explicit pauses.
3. If any fragment alignment is invalid, merge the final audio and recognize that complete track once with the configured ASR. Do not mix aligned and recognized fragment timing.
4. If neither alignment nor ASR is available, return audio only and require `transcribe` before authoring clocks.

Inserted `pauseAfterMs` silence is added after fragment alignment and is part of the final audio. No timing is derived from character counts or semantic intent. Direct CLI whole-text alignment remains available for compatibility, but its result must pass the same plausibility checks and fall back to ASR when invalid.

## Validation and Errors

All validation runs before model loading, downloads, API calls, or output replacement:

1. Validate `speech.json` against `runtime/schemas/speech.schema.json`.
2. Resolve the active TTS profile from project config.
3. Verify every `control.type` is accepted by that profile.
4. Validate model-specific formats and ranges, including required instructions, IndexTTS2 emotion values, edge-tts signed prosody strings, and known API request fields.
5. Verify segment IDs are unique, text is non-empty, intent values are in range, and pauses are integers from `0` through `10000`.
6. Verify exact source-text reproduction.

Errors identify the segment, selected profile, unsupported field, and the available remedies. For example:

```text
segment s2 uses qwen-instruct, but Qwen3-TTS Base accepts only none.
Switch to CustomVoice/VoiceDesign or regenerate a neutral clause-level plan.
```

No partial target audio is retained when segment generation or merging fails. If alignment fails after the final track has been assembled, retain that complete track and fall back to ASR so expensive synthesis is not repeated.

## CLI and Backward Compatibility

- `yumoframe synthesize` without a plan retains current single-text behavior.
- `yumoframe synthesize --plan speech.json` validates and executes segmented synthesis.
- `yumoframe synthesize --capabilities` prints the resolved profile and exits without synthesis.
- Existing edge-tts, generic command, and API configurations keep working unchanged for whole-text synthesis.

`speech.json` is not created by `init`. The Skill creates, shows, and requires approval for it on every voiced TTS project; it remains optional only when a user invokes the CLI directly outside the Skill.

## Skill Changes

Update the packaged authoring Skill to:

- inspect project TTS config and hardware before model selection;
- call `synthesize --capabilities` instead of duplicating model capability rules;
- mechanically split source text before semantic analysis;
- analyze intent before generating model fields;
- generate only control types and fields allowed by the resolved profile;
- preserve wording and verify exact source reconstruction;
- present the plan and wait for approval;
- explain unsupported segmented delivery and require an engine switch instead of silently using whole-text synthesis;
- regenerate only controls when the model changes.

## Verification

- One Node integration test uses a fake plan-aware processor to prove that multiple segments produce one merged target, text remains exact, and generation is rejected before process startup when a control/profile mismatch exists.
- One Qwen Python unit test passes multiple mocked segments and verifies one model instance/batch call produces ordered fragments with the expected per-item instructions.
- One validation test covers model-specific constraints with representative Qwen, IndexTTS2, and edge-tts controls.
- Run `mise exec -- pnpm test`, `mise exec -- pnpm typecheck`, the Qwen processor unit tests, `mise exec -- pnpm pack --dry-run`, and `git diff --check`.
- Do not download models or run real synthesis during automated verification.

## Out of Scope

- A bundled IndexTTS2 processor
- A YumoFrame-managed long-running TTS daemon
- Segment audio caching or selective segment regeneration
- Automatic voice-quality scoring
- Streaming synthesis
- Invented timestamps or character-duration timing
