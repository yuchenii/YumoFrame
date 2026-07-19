# Repository guidance

## Project shape

YumoFrame is a Node.js 20+ TypeScript ESM CLI managed as a small pnpm workspace. `packages/cli/src/` compiles to `packages/cli/dist/`. Shared CLI modules live under `core/`, `media/`, and `templates/` and are exported to template adapters via the private `@yumoframe/cli` package (extensionless subpaths such as `@yumoframe/cli/media/align`). One npm package ships that CLI together with:

- `packages/templates/*/` — private Remotion template workspaces and their Adapters
- `processors/*/` — bundled Python/uv processors
- `skills/` — the installable authoring skill
- `schemas/` — project data schemas
- `tests/` — Node tests against the compiled CLI

Normal YumoFrame projects are data-only. Keep template code and dependencies in the packaged templates unless the existing `eject` flow explicitly copies them into a project.

## Working rules

- Use the pinned toolchain through `mise exec -- ...`; the package manager is pnpm.
- Keep changes narrow and reuse existing commands, helpers, types, and dependencies before adding anything.
- Preserve strict TypeScript and NodeNext ESM conventions. Relative imports between `.ts` sources use `.ts` suffixes; `tsc` rewrites them to `.js` in `dist/` via `rewriteRelativeImportExtensions`. Imports of built JS (such as `adapter-dist/index.js`) keep the `.js` suffix. Package imports (such as `@yumoframe/cli/media/align`) stay extensionless.
- Resolve configured paths from the directory containing `yumoframe.config.json`, not from an assumed current working directory.
- Treat `lines.json` and `storyboard.json` as authoring inputs. Treat `transcript.json`, `project.json`, and `dist/` as generated outputs; change their generators instead of patching generated files.
- For media projects, derive line timing from `transcript.json`; do not invent timestamps. Preserve the original extracted voice track for playback.
- Keep `README.md` and `README.en.md` aligned when user-facing behavior changes.
- Do not render a final video until the user has reviewed the Studio preview.
- Preserve unrelated working-tree and staged changes.

## Verification

Run the smallest relevant check from the repository root:

```bash
mise exec -- pnpm build:cli   # packages/cli/src/** and template Adapters
mise exec -- pnpm test        # CLI behavior; builds first
mise exec -- pnpm typecheck   # CLI or Remotion template types
mise exec -- pnpm fmt:check   # oxfmt
mise exec -- pnpm lint        # oxlint
uv run --project processors/funasr python -m unittest discover -s processors/funasr/tests  # processor changes
mise exec -- pnpm pack --dry-run  # package layout changes
git diff --check
```

Do not install dependencies or run costly transcription/render smoke tests unless the touched behavior requires them. Add or update the smallest regression test for non-trivial logic.

For architecture and setup details, use `docs/architecture.md` and `docs/development.md` instead of duplicating them here.
