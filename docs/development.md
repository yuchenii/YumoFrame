# Development

Guide for working on the YumoFrame repository itself. End users should follow the root [README（中文）](../README.md) or [README (English)](../README.en.md) (`npm install -g yumoframe` + `npx skills add`).

## Setup

Node is pinned in `mise.toml`. From the repo root:

```bash
mise install
mise exec -- pnpm install
mise exec -- pnpm build:cli
mise exec -- pnpm link --global   # optional: `yumoframe` points at this checkout
mise exec -- node dist/cli.js doctor
```

Without a global link, invoke the built CLI as `node dist/cli.js …` or use the `pnpm` scripts (they run `build:cli` first).

## Install the skill from this checkout

Point Skills CLI at this repo’s `runtime/` directory — not a video project or test cwd. Install is **project-local** (no `--global`):

```bash
# From any directory; use an absolute path to this repo’s runtime/
npx skills add /absolute/path/to/YumoFrame/runtime --skill yumoframe-comedy-text

# Or from the YumoFrame repo root:
npx skills add ./runtime --skill yumoframe-comedy-text
```

After the repo is public on GitHub, prefer the published form for telemetry / [skills.sh](https://www.skills.sh/docs) indexing:

```bash
npx skills add yuchenii/YumoFrame --skill yumoframe-comedy-text
```

## What to rebuild

| You changed | What to run |
|-------------|-------------|
| `src/**` | `pnpm build:cli`, then re-run the CLI / `pnpm test` |
| `runtime/templates/comedy-text/**` | No CLI rebuild; open `yumoframe studio` in a data project |
| `runtime/processors/funasr/**` | No CLI rebuild; run `yumoframe transcribe` (ASR) or `synthesize` with `processors.align` (forced align). **Bump `runtimeVersion`** so the cached venv rebuilds with your Python changes |
| `runtime/skills/**` | Re-run `npx skills add …` if your agent install was a copy; symlink installs pick up edits automatically |

## Useful scripts

```bash
pnpm build:cli      # compile src/ → dist/
pnpm typecheck
pnpm test           # build + node:test
pnpm pack --dry-run # inspect the npm tarball (dist/ + runtime/)
```

## Layout

```text
src/                              # TypeScript CLI (compiled to dist/)
runtime/templates/comedy-text/    # packaged Remotion template
runtime/processors/funasr/        # packaged Python engine: ASR + forced alignment (uv)
runtime/skills/yumoframe-comedy-text/
runtime/schemas/
test/                             # node:test suites against dist/
docs/                             # design & architecture notes
```

The published npm package is `dist/` + `runtime/` (see `package.json` `files` and `.npmignore`). Architecture overview: [architecture.md](architecture.md).
