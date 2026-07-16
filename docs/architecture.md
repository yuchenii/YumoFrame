# Architecture

YumoFrame v0.1 = **npm 包里的 CLI + `runtime/`**。用户项目只存数据（data-only），不带模板依赖和 Python 环境。

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
        runtime 模板（或 eject 后的本地模板）→ out/video.mp4
```

人确认的关键面主要是 `transcript.md`、`project.md` 和 studio 预览。Skill 要求 Agent 逐步停顿，不能擅自连跑 validate → studio → render。

## 代码结构

仓库（开发树）大致如下。`src/` 编到 `dist/`；发布进 npm 的是 `dist/` + `runtime/`。

```text
YumoFrame/
├── src/                          # CLI TypeScript 源码 → dist/
│   ├── cli.ts                    # Commander 入口与子命令接线
│   ├── types.ts                  # 共享类型（lines / storyboard / project / config）
│   ├── config.ts                 # 向上查找并加载 yumoframe.config.json
│   ├── json.ts                   # 解析/校验 JSON 文档
│   ├── comedy-text.ts            # comedy-text：sanitize / resolve / validate
│   ├── align.ts                  # 文案对齐 ASR 字符时间轴
│   ├── processor-runtime.ts      # processor 运行时：venv 路径、spawn、在线 TTS HTTP、option→flag
│   ├── subtitles.ts              # TTS 字幕（SRT/VTT）→ transcript.json（tier-1 时间）
│   ├── project-md.ts             # project.md ↔ storyboard
│   ├── transcript-md.ts          # transcript.md ↔ transcript.json
│   ├── runtime.ts                # PACKAGE_ROOT、模板路径、Remotion 调用
│   └── commands/
│       ├── init.ts               # 初始化 data-only 项目
│       ├── transcribe.ts         # 调 FunASR（ASR）+ 抽 voice
│       ├── synthesize.ts         # TTS 出声轨（别名 tts）+ 三档取时间
│       ├── sync.ts               # sync transcript / project
│       ├── resolve.ts            # storyboard → project.json 等
│       ├── validate.ts
│       ├── dev.ts / render.ts    # studio / 出片
│       ├── layout.ts             # SVG 布局预览
│       ├── eject.ts / doctor.ts / import.ts
│       └── …
├── runtime/                      # 随包发布的运行时资源
│   ├── templates/comedy-text/    # Remotion 工程
│   │   └── src/
│   │       ├── compositions/ComedyTextVideo.tsx
│   │       ├── components/       # KineticTextBlock、CursorBlock
│   │       ├── lib/              # autoLayout、camera、layout、timing…
│   │       ├── Root.tsx / App.tsx / index.tsx
│   │       └── types.ts
│   ├── processors/funasr/        # Python（uv 项目）：ASR + 强制对齐两种模式
│   │   └── src/media_text/cli.py #   media-text <audio>（ASR）/ --align <text>（对齐）
│   ├── processors/qwen3-tts/     # Python（uv 项目）：本地文字转 WAV
│   │   └── src/qwen3_tts_processor/cli.py
│   ├── skills/yumoframe-comedy-text/
│   │   ├── SKILL.md
│   │   ├── references/
│   │   └── scripts/line-units.mjs
│   └── schemas/                  # *.schema.json
├── test/                         # node:test，测 dist/
├── docs/
│   ├── architecture.md
│   └── development.md
├── package.json                  # bin → dist/cli.js；files: dist + runtime
└── tsconfig.json
```

模块关系（简图）：

```text
cli.ts
  └─ commands/* ──┬─ config / json / types
                  ├─ comedy-text + align      （resolve / validate）
                  ├─ project-md / transcript-md（sync / resolve 产物）
                  ├─ processor-runtime + subtitles（transcribe / synthesize）
                  └─ runtime.ts               （studio / render → templates）
transcribe ── uv run → processors/funasr（ASR）
synthesize ── processors.tts（api / command / uv）→ 声轨
              ├─ speech.json：Skill 配音流程必需；intent → 模型 control → 分段生成 → ffmpeg 合并
              └─ 时间：TTS 字幕 │ 分片强制对齐后按真实时长偏移 │ ASR 兜底
skill 安装 ── npx skills add → skills/yumoframe-comedy-text（不经 CLI）
```

## Processor 抽象

`processors.asr` / `processors.tts?` / `processors.align?` 共用一个 `Processor` 联合，按 `runner` 选引擎——扩展新引擎只加配置或外部命令，包体不随模型数膨胀：

| runner | 跑法 | 覆盖 |
|--------|------|------|
| `uv` | 包内 `runtime/processors/<name>` 一次性跑，venv 按 `(name, runtimeVersion)` 缓存 | qwen3-tts（TTS）、funasr（ASR + 对齐） |
| `command` | 任意外部可执行；TTS 支持 `{text}` / `{out}` / `{subs}` 占位符 | edge-tts（`uvx`，免安装）、自定义 |
| `api` | Node 原生 fetch；阿里走原生 Qwen-TTS，其他可走 OpenAI 兼容 `/audio/speech` | DashScope、OpenAI、自定义 |

`options` 里的键透传成 `--kebab` flag（如 `maxSegmentMs → --max-segment-ms`、`model → --model`），本地 uv 引擎因此可指定模型。三个 processor 结束时都落地文件（transcript.json 或音频），文件缝契约稳定，`api` 也不需要常驻服务。

分段配音能力由包内 `runtime/processors/tts-profiles.json` 统一声明，CLI 和 Skill 共用。`speech.json` 的 `intent` 保留与模型无关的表演意图，`control` 是 profile 允许的模型参数；切换模型只重新生成 control。Qwen plan worker 在一个 Python 进程中加载一次模型并批量输出片段。FunASR 在另一个进程中只加载一次对齐模型，逐片返回时间戳；TypeScript 按片段真实时长和明确停顿累加偏移，再用 ffmpeg 合并同一批片段。任一片段不可信时，整条最终音频统一降级到 ASR，不混用时间来源。未知 command/API 默认 `single + none`，不会猜测或忽略语气字段。

## npm 包内容

| 路径 | 作用 |
|------|------|
| `dist/` | `src/` 编译出的 CLI（`bin`: `yumoframe`） |
| `runtime/templates/comedy-text/` | Remotion 模板，`studio` / `render` 使用 |
| `runtime/processors/funasr/` | 内置 Python 引擎：ASR + 强制对齐；`transcribe`（ASR）与 `synthesize` 的强制对齐（`processors.align`）通过 `uv` + ffmpeg 调用 |
| `runtime/processors/qwen3-tts/` | 内置 Python TTS：0.6B/1.7B CustomVoice、1.7B VoiceDesign、1.7B Base 分别走对应生成 API；默认 0.6B + Vivian；plan 模式一次加载并输出逐分句 WAV |
| `runtime/skills/yumoframe-comedy-text/` | 创作 Skill，用 `npx skills add` 安装（无 `yumoframe skill` 命令） |
| `runtime/schemas/` | lines / storyboard / transcript / project / speech 的 JSON schema |

发布物由 `package.json` 的 `files` + `.npmignore` 决定，实质是 `dist/` + `runtime/`。uv processor 的 venv 缓存在用户缓存目录，按 `(name, runtimeVersion)` 分目录（每个引擎各一份，不互撞），不写进每个视频项目。**改了 processor 的 Python 代码要 bump `runtimeVersion`**，否则用户端旧 venv 缓存命中、跑的还是旧代码。线上 `api` TTS 与外部 `command`（含 `uvx edge-tts`）不进包体。

## 项目根与配置

CLI 从当前目录向上查找 `yumoframe.config.json`；所有 `paths.*` 相对该文件所在目录解析。

| 文件 | 角色 |
|------|------|
| `lines.json` | 中间态：断行与高亮（扁平） |
| `speech.json` | TTS 表演计划：Skill 配音流程必需、裸 CLI 可选；保存分段 intent + 当前模型 control，不含时间戳 |
| `storyboard.json` | 作者树：`scenes[].lines`；有转写时一般不写时钟，由 resolve align |
| `transcript.json` | 逐字时间线：来自 ASR，或 TTS 字幕 / 强制对齐（形状相同，resolve 统一消费） |
| `transcript.md` | 校对视图；只改 `校对：`，再 `sync transcript` |
| `project.md` | 可读分镜；可调分组 / 文案 / `**highlight**`；标题时钟与 `rotate` 仅展示 |
| `project.json` | resolve 生成的渲染契约；**不要手改** |
| `out/video.mp4` | 渲染输出 |

`resolve` 会刷新 `storyboard.json`、`lines.json`、`project.json`，并生成/更新 `project.md`。  
`sync project` 从 `project.md` 回写 storyboard/lines/project（有转写时可对齐时间）。  
v0.1 里 `project.json` 的零坐标占位由模板内确定性 auto-layout 在预览/渲染前补齐。

## CLI 职责

| 命令 | 作用 |
|------|------|
| `init` | 建 data-only 项目与配置 |
| `transcribe` | 媒体 → transcript + 抽出原声（ASR） |
| `synthesize`（别名 `tts`） | 文本 → 声轨；`--capabilities` 查能力，`--plan speech.json` 分段生成；能出时间戳时顺带写 transcript |
| `sync` | `transcript` / `project` / `all` |
| `resolve` | storyboard → project；有 transcript 时默认 align |
| `validate` | 校验已有作者/产物文件 |
| `studio` / `dev` | Remotion Studio 预览（先 validate） |
| `render` | 出片（先 validate） |
| `layout` | 写出布局 SVG 预览 |
| `eject` | 拷贝模板到项目，`templateSource: local` |
| `doctor` / `templates` | 环境与模板列表 |

模板源：`templateSource: "runtime"` 用包内模板；`local` 用 `templatePath`（eject 后）。CLI 仍负责提供 Remotion 依赖，eject 后的项目通常仍无自己的 `node_modules`。

## 文本 / 文本转语音 / 音视频

- **文本**：行上写全局 `start` / `end`；无需 ASR。
- **音视频**：`transcribe` → 校对 → `sync transcript` → Agent 写 lines/storyboard（**不要编时钟**）→ `resolve`（auto-align）→ validate / studio / render；保留抽出的原声音轨。
- **文本转语音**：Skill 先强制生成并审核 `speech.json`，再由 `synthesize --plan` 出声轨；裸 CLI 仍兼容整段合成。时间按三档取得——**尽量不走 ASR 回环**，避免"原文 ↔ 识别文本"对不上：
  1. **TTS 自带时间戳**：命令含 `{subs}`（如 edge-tts `--write-subtitles`）→ 字幕经 `subtitles.ts` 转 transcript.json；
  2. **强制对齐**：计划内每个片段分别用已知文本标时间，再按真实片段时长和停顿偏移；整段 CLI 兼容路径仍可全文对齐，结果必须通过合理性校验；
  3. **ASR 兜底**：都没有时事后 `transcribe`。
  产出 transcript 后同音视频链路 `resolve → render`。

`文本 → TTS → ASR → 文本` 不是无损的（同音字、数字、增漏字），所以第 1/2 档以"已知文本"为准、时间戳同源或对齐而来。已知文字相同不代表时间正确；对齐不可信时，第 3 档才对最终音频识别并要求人工校对。
