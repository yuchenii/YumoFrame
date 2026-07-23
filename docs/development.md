# 开发指南

本文面向 YumoFrame 仓库的开发者。普通用户请阅读根目录的 [README（中文）](../README.md) 或 [README（英文）](../README.en.md)，通过 `npm install -g yumoframe` 和 `npx skills add` 使用。

## 环境准备

Node 版本固定在 `mise.toml` 中。在仓库根目录执行：

```bash
mise install
mise exec -- pnpm install
mise exec -- pnpm build:cli
mise exec -- pnpm link --global   # 可选：让 `yumoframe` 指向当前工作区
mise exec -- node packages/cli/dist/cli.js doctor
```

如果没有建立全局链接，可以通过 `node packages/cli/dist/cli.js …` 调用编译后的 CLI，也可以使用 `pnpm` 脚本；这些脚本会先执行 `build:cli`。

## 从当前工作区安装 Skill

Skills CLI 应指向本仓库的 `skills/` 目录，而不是视频项目或测试目录。以下安装是**当前项目级别**的，不使用 `--global`：

```bash
# 可在任意目录执行；将路径替换为本仓库 skills/ 的绝对路径
npx skills add /absolute/path/to/YumoFrame/skills --skill yumoframe

# 或者在 YumoFrame 仓库根目录执行
npx skills add ./skills --skill yumoframe
```

仓库发布到 GitHub 后，优先使用下面的形式，以便统计和 [skills.sh](https://www.skills.sh/docs) 收录：

```bash
npx skills add yuchenii/YumoFrame --skill yumoframe
```

## 修改后需要重新构建什么

| 修改内容 | 需要执行 |
| --- | --- |
| `packages/cli/src/**` | 执行 `pnpm build:cli`，然后重新运行 CLI 或 `pnpm test` |
| `packages/templates/*/src/adapter/**` | 执行 `pnpm build:cli`；它会先生成各模板的 `adapter-dist/index.js` |
| `packages/templates/*/**`（不含 adapter） | 无需重新编译 CLI；在数据项目中打开 `yumoframe studio` |
| `processors/funasr/**` | 无需重新编译 CLI；运行 `yumoframe transcribe`（ASR），或通过带 `processors.align` 的 `synthesize` 测试强制对齐。修改已发布的 Python 实现时必须提升 `runtimeVersion`，让缓存的虚拟环境重新构建 |
| `processors/qwen3-tts/**` | 无需重新编译 CLI；运行对应单元测试或 `yumoframe synthesize`。Plan 模式只加载一次模型并按顺序写出 WAV 分片。修改已发布的 processor 时必须提升 `runtimeVersion` |
| `processors/tts-profiles.json` / `schemas/speech.schema.json` | 重新构建并测试 CLI，再运行 `pnpm pack --dry-run`；这些是分段 TTS 与 Skill 共用的运行时契约 |
| `skills/**` | 如果 Agent 安装的是文件副本，需要重新执行 `npx skills add …`；符号链接安装会自动读取最新修改 |

### 构建顺序

`pnpm build:cli` 固定为：

1. `pnpm build:adapters` — 用 Vite 把各模板 `src/adapter/` 打成 `adapter-dist/index.js`（会把 `@yumoframe/cli/*` 共享模块打进产物，发布后自包含）
2. `tsc` — 编译 CLI；`registry.ts` 静态导入上述 `adapter-dist`

不要单独跑 `tsc -p tsconfig.json` 而跳过 adapters：`pnpm typecheck` / `pnpm build:cli` 都会先生成 `adapter-dist`（含 `index.js` 与 `index.d.ts`）。

相对路径 import 在源码里写 `.ts` 后缀（如 `./types.ts`）；`rewriteRelativeImportExtensions` 会在 `dist/` 里改写成 `.js`。包导入保持无后缀（如 `@yumoframe/cli/media/align`）。`adapter-dist/index.js` 这类已构建 JS 仍写 `.js`。

`@yumoframe/cli` 是私有 workspace 包：`exports` 指向 `.ts` 源文件，只给模板 Adapter 的 TypeScript / Vite 构建用，**不是**给 Node 在运行时直接 `import` 的入口。

`processors/tts-profiles.json` 是本地/API 模型、协议、profile 和控制参数映射的唯一事实来源。内置 API 模型必须固定一组已验证的 `protocol + profile`；未知 API 模型只允许由用户显式组合已注册且兼容的协议与 profile。README 可以向用户概述当前的内置映射，但 Skill 必须调用 `yumoframe synthesize --capabilities`，不能复制该表；这样新增 profile 后无需再次修改 Skill。由 `yumoframe` Skill 发起的每一次配音都必须先生成并审核分句级 `speech.json`，再调用 `synthesize --plan`。整段文本直接合成仍可用于 Skill 之外的 CLI 调用。

Plan 模式按分片计算时间：TTS worker 输出有序分片；一个 FunASR 进程分别对齐各分片；TypeScript 根据每个分片的实测时长和 `pauseAfterMs` 累加时间偏移；ffmpeg 合并同一批分片。不要改成整条音轨文本匹配或按字符数估算时间。如果任一分片的对齐结果不可信，应使用配置的 ASR 对最终音频完整识别一次，并要求人工校对 transcript。

## 常用脚本

```bash
pnpm build:adapters # 将模板 adapter 编译到各自的 adapter-dist/
pnpm build:cli      # 先构建 adapter，再将 CLI 编译到 packages/cli/dist/
pnpm typecheck
pnpm fmt            # oxfmt 格式化
pnpm fmt:check      # 仅检查格式
pnpm lint           # oxlint
pnpm lint:fix      # oxlint 自动修复
pnpm test           # 构建后运行 node:test
pnpm pack --dry-run # 检查 npm 包内容（`prepack` 会先 `build:cli`）
pnpm test:pack      # 对真实 tarball 跑 packed-smoke（默认 --skip-render）
```

## 发布

Release It 会更新 `package.json`，同步生成的项目配置版本，提交修改，创建带注释的 `v*` 标签，并推送提交与标签。npm 发布只在 GitHub Actions 中执行（`publish.yml`，由 `v*` tag 触发）。仓库目前没有独立的 push/PR CI workflow。

```bash
pnpm release patch              # 只更新包版本和配置版本
pnpm release minor
pnpm release:runtime patch      # 同时让 processor 虚拟环境缓存失效
pnpm release patch --dry-run    # 不修改 Git 或文件，仅预览结果
```

只有已发布的 `processors/**` 实现发生变化时才使用 `release:runtime`。CLI 直接从 `package.json` 读取版本，不需要单独维护版本字符串。

npm Trusted Publisher 应指向 GitHub Actions 所有者 `yuchenii`、仓库 `YumoFrame` 和工作流 `publish.yml`。该工作流通过 OIDC（`id-token: write`）发布，因此 GitHub 中不保存长期有效的 `NPM_TOKEN`。

## 目录结构

```text
packages/
  cli/                                    # @yumoframe/cli（私有）；exports 指向 .ts，供 Adapter 开发用
    src/
      cli.ts
      commands/
      core/                               # config / types / json / package-root
      media/                              # align / transcript / TTS / processor 运行时
      remotion/                           # studio / render
      templates/                          # Registry、公共 Adapter 协议和 JSON 信任边界
    dist/                                 # tsc 输出
  templates/                              # 私有 pnpm workspace；随 npm 包发布
    rotating-flow/                        # scenes[].lines[]
    center-line/                          # lines[] + Preset
    chat-bubbles/                         # participants[] + messages[]
processors/funasr/                        # Python/uv 引擎：ASR + 强制对齐
processors/qwen3-tts/                     # Python/uv 引擎：本地 Qwen3-TTS
skills/yumoframe/
schemas/
tests/                                    # 针对 CLI dist/ 的 node:test 测试
docs/                                     # 设计与架构文档
```

发布内容由根 `package.json` 的 `files` 与 `.npmignore` 决定，仍然只产生一个 `yumoframe` npm 包。架构概览见 [architecture.md](architecture.md)。
