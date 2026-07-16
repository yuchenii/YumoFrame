# TTS output path synchronization

## Goal

Make every successful `yumoframe synthesize` result become the project's narration automatically. The generated file must be inside the YumoFrame project so Remotion can serve it through `staticFile()`.

## Behavior

- Keep the existing `--out <file>` option; add no command.
- Resolve the output relative to the project root and reject paths outside that root before synthesis starts.
- After the final audio file has been written successfully, update both `paths.media` and `paths.voice` in `yumoframe.config.json` to the actual project-relative output path before deriving timing.
- Do not update the config when synthesis or fragment merging fails. If subtitle parsing or forced alignment later fails, keep the update because the referenced audio already exists.
- Preserve explicit storyboard audio. `resolve` and `sync` continue to attach `paths.voice` only when the storyboard has no authored audio.

## Data flow

```text
synthesize [--out] -> validate project-local path -> generate audio -> derive timing
                   -> atomically write config paths.media + paths.voice
                   -> resolve -> project.audio.voice -> Remotion Audio
```

The config write belongs in the CLI, not the Skill. The Skill only tells the Agent that synthesis persists the actual output path and that it must not hand-edit these fields afterward.

## Validation

Add one CLI regression test using a fake TTS command. It verifies that a successful custom output updates both config paths, an outside-project output is rejected before TTS runs, and the existing resolve flow attaches the generated file as narration.
