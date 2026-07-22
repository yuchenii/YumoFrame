# Architecture

YumoFrame v0.1 = **一个 npm 包里的 CLI、模板、Processor、Skill 与 Schema**。用户项目只存数据（data-only），不带模板依赖和 Python 环境。

## 总览

```text
Agent（Skill）撰写 lines.json / storyboard.json
        │
        ├─ 音视频：transcribe → 校对 transcript.md → sync transcript
        ├─ 文本转语音：synthesize（TTS 出声轨 + 时间）→ 校对 → sync
        └─ 文本：直接带 start/end 撰写
                ↓
        resolve（可 auto-align）→ 写出 project.json + project.md + lines.json
                ↓
        validate → studio（预览）→ 人确认后再 render
                ↓
        内置模板（或 eject 后的本地模板）→ out/video.mp4
```

人确认的关键面主要是 `transcript.md`、`project.md` 和 studio 预览。Skill 要求 Agent 逐步停顿，不能擅自连跑 validate → studio → render。

## 代码结构

仓库（开发树）大致如下。CLI 编到 `packages/cli/dist/`；根 `package.json` 仍只发布一个 npm 包。

```text
YumoFrame/
├── packages/
│   ├── cli/                      # 私有 workspace 包 @yumoframe/cli
│   │   ├── package.json          # exports: core/*、media/*、templates/*（指向 .ts 源码）
│   │   ├── src/
│   │   │   ├── cli.ts
│   │   │   ├── commands/
│   │   │   ├── core/             # config / types / json / package-root
│   │   │   ├── media/            # align / transcript / TTS / processors
│   │   │   ├── remotion/         # studio / render
│   │   │   └── templates/        # Registry + Adapter 协议
│   │   └── dist/
│   └── templates/                # 私有 pnpm workspace
│       ├── rotating-flow/        # Remotion + Adapter + 模板契约
│       ├── center-line/
│       └── chat-bubbles/
├── processors/
│   ├── funasr/                   # Python/uv：ASR + 强制对齐
│   ├── qwen3-tts/                # Python/uv：本地 TTS
│   └── tts-profiles.json
├── skills/yumoframe/             # 可安装 Agent Skill
├── schemas/                      # 公共 JSON Schema
├── tests/                        # node:test 与打包 smoke
├── scripts/                      # 构建和发布脚本
├── docs/
├── pnpm-workspace.yaml
└── package.json                  # 唯一 npm 发布单元
```

模块关系（简图）：

```text
cli.ts
  └─ commands/* ──┬─ core（config / json / types）
                  ├─ media（align / transcript-md / tts-plan / processor-runtime）
                  ├─ remotion/runtime（studio / render）
                  └─ templates Registry → packages/templates/*/adapter-dist
transcribe ── uv run → processors/funasr（ASR）
synthesize ── processors.tts（api / command / uv）→ 声轨
              ├─ speech.json：Skill 配音流程必需；intent → 模型 control → 分段生成 → ffmpeg 合并
              └─ 时间：TTS 字幕 │ 分片强制对齐后按真实时长偏移 │ ASR 兜底
skill 安装 ── npx skills add → skills/yumoframe（不经 CLI）
```

模板 Adapter 源码通过无后缀子路径引用共享模块（如 `@yumoframe/cli/media/align`）。`@yumoframe/cli` 是私有开发包：`exports` 指向 `.ts` 源文件，供 TypeScript / Vite 解析；`build:adapters` 会把用到的模块打进 `adapter-dist`，运行时并不直接 `import '@yumoframe/cli/...'`。发布物仍是单个 `yumoframe` npm 包。

## Processor 抽象

`processors.asr` / `processors.tts?` / `processors.align?` 共用一个 `Processor` 联合，按 `runner` 选引擎——扩展新引擎只加配置或外部命令，包体不随模型数膨胀：

| runner | 跑法 | 覆盖 |
| --- | --- | --- |
| `uv` | 包内 `processors/<name>` 一次性跑，venv 按 `(name, runtimeVersion)` 缓存 | qwen3-tts（TTS）、funasr（ASR + 对齐） |
| `command` | 任意外部可执行；TTS 支持 `{text}` / `{out}` / `{subs}` 占位符 | edge-tts（`uvx`，免安装）、自定义 |
| `api` | Node 原生 fetch；阿里走原生 Qwen-TTS，其他可走 OpenAI 兼容 `/audio/speech` | DashScope、OpenAI、自定义 |

`options` 里的键透传成 `--kebab` flag（如 `maxSegmentMs → --max-segment-ms`、`model → --model`），本地 uv 引擎因此可指定模型。三个 processor 结束时都落地文件（transcript.json 或音频），文件缝契约稳定，`api` 也不需要常驻服务。

分段配音能力和内置模型可选下载源由包内 `processors/tts-profiles.json` 统一声明，CLI、Skill 和 Qwen processor 共用。`modelSource` 从来源数组中选择平台，未指定时优先 ModelScope；运行时不根据 404 或网络错误自动改选。`speech.json` 的 `intent` 保留与模型无关的表演意图，`control` 是 profile 允许的模型参数；切换模型只重新生成 control。Qwen processor 复用所选来源的完整缓存，缓存不完整时由同一平台继续下载。plan worker 随后在一个 Python 进程中加载一次模型并批量输出片段。FunASR 在另一个进程中只加载一次对齐模型，逐片返回时间戳；TypeScript 按片段真实时长和明确停顿累加偏移，再用 ffmpeg 合并同一批片段。任一片段不可信时，整条最终音频统一降级到 ASR，不混用时间来源。未知 command/API 默认 `single + none`，不会猜测或忽略语气字段。

## npm 包内容

| 路径 | 作用 |
| --- | --- |
| `packages/cli/dist/` | CLI 构建产物（`bin`: `yumoframe`） |
| `packages/templates/*/` | 内置 Remotion 模板及其 Adapter；`studio` / `render` 使用前端代码，CLI 加载构建后的 `adapter-dist/index.js` |
| `processors/funasr/` | 内置 Python 引擎：ASR + 强制对齐；`transcribe`（ASR）与 `synthesize` 的强制对齐（`processors.align`）通过 `uv` + ffmpeg 调用 |
| `processors/qwen3-tts/` | 内置 Python TTS：0.6B/1.7B CustomVoice、1.7B VoiceDesign、1.7B Base 分别走对应生成 API；默认 0.6B + Vivian；plan 模式一次加载并输出逐分句 WAV |
| `skills/yumoframe/` | 通用创作 Skill，用 `npx skills add` 安装（无 `yumoframe skill` 命令） |
| `schemas/` | lines / storyboard / transcript / project / speech 的 JSON schema |

发布物由 `package.json` 的 `files` + `.npmignore` 决定，实质是 `packages/cli/dist/`、`packages/templates/`、`processors/`、`skills/` 和 `schemas/`。uv processor 的 venv 缓存在用户缓存目录，按 `(name, runtimeVersion)` 分目录（每个引擎各一份，不互撞），不写进每个视频项目。**改了 processor 的 Python 代码要 bump `runtimeVersion`**，否则用户端旧 venv 缓存命中、跑的还是旧代码。线上 `api` TTS 与外部 `command`（含 `uvx edge-tts`）不进包体。

## 项目根与配置

CLI 从当前目录向上查找 `yumoframe.config.json`；所有 `paths.*` 相对该文件所在目录解析。

| 文件                                | 角色                                     |
| ----------------------------------- | ---------------------------------------- |
| `lines.json`                        | 中间态：断行与高亮（扁平）               |
| `storyboard.json`                   | 作者输入（按模板契约）                   |
| `transcript.json` / `transcript.md` | 转写/TTS 时间源与校对稿                  |
| `project.json` / `project.md`       | resolve 生成的渲染契约与可读预览         |
| `yumoframe.config.json`             | 项目配置：模板、路径、render、processors |

## 命令边界

框架命令（`init` / `resolve` / `validate` / `studio` / `render` / `inspect` / …）只通过 Template Registry 与 Adapter 协议分发；模板专属字段由各 Adapter 解析。`inspect --json` 是 Skill 的首选入口。
