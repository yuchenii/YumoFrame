# Repository guidance

## Project shape

YumoFrame is a Node.js 20+ TypeScript ESM CLI. `src/` compiles to the unpublished `dist/` build output. The npm package ships that CLI together with `runtime/`:

- `runtime/templates/comedy-text/` — the Remotion template
- `runtime/processors/funasr/` — the Python/uv transcription processor
- `runtime/skills/` — the installable authoring skill
- `runtime/schemas/` — project data schemas
- `test/` — Node tests against the compiled CLI

Normal YumoFrame projects are data-only. Keep template code and dependencies in the packaged runtime unless the existing `eject` flow explicitly copies them into a project.

## Working rules

- Use the pinned toolchain through `mise exec -- ...`; the package manager is pnpm.
- Keep changes narrow and reuse existing commands, helpers, types, and dependencies before adding anything.
- Preserve strict TypeScript and NodeNext ESM conventions, including `.js` suffixes in relative imports.
- Resolve configured paths from the directory containing `yumoframe.config.json`, not from an assumed current working directory.
- Treat `lines.json` and `storyboard.json` as authoring inputs. Treat `transcript.json`, `project.json`, and `dist/` as generated outputs; change their generators instead of patching generated files.
- For media projects, derive line timing from `transcript.json`; do not invent timestamps. Preserve the original extracted voice track for playback.
- Keep `README.md` and `README.en.md` aligned when user-facing behavior changes.
- Do not render a final video until the user has reviewed the Studio preview.
- Preserve unrelated working-tree and staged changes.

## Verification

Run the smallest relevant check from the repository root:

```bash
mise exec -- pnpm build:cli   # src/**
mise exec -- pnpm test        # CLI behavior; builds first
mise exec -- pnpm typecheck   # CLI or Remotion template types
uv run --project runtime/processors/funasr python -m unittest discover -s runtime/processors/funasr/tests  # processor changes
mise exec -- pnpm pack --dry-run  # package/runtime layout changes
git diff --check
```

Do not install dependencies or run costly transcription/render smoke tests unless the touched behavior requires them. Add or update the smallest regression test for non-trivial logic.

For architecture and setup details, use `docs/architecture.md` and `docs/development.md` instead of duplicating them here.
