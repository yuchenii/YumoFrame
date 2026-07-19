# YumoFrame

[English](README.en.md) | 中文

[![npm version](https://img.shields.io/npm/v/yumoframe.svg?style=flat)](https://www.npmjs.com/package/yumoframe) [![npm downloads](https://img.shields.io/npm/dm/yumoframe.svg?style=flat)](https://www.npmjs.com/package/yumoframe) [![skills.sh](https://skills.sh/b/yuchenii/YumoFrame)](https://skills.sh/yuchenii/YumoFrame)

YumoFrame 是基于 Remotion 的 CLI，用结构化项目数据制作可复用的竖屏视频。

内置模板包括 `rotating-flow`（旋转画布动态文字）、`center-line`（中央逐行文字）和 `chat-bubbles`（参与者与文字聊天气泡）；`center-line` 提供 `minimal-dark` 与 `echo` 两个 Preset。

日常用法是：装好工具 → 把需求交给 Agent → 在关键节点确认与修改一下 → 预览满意后再渲染。断行、高亮、分镜交给 Agent；不要手写 `project.json`。

## 安装

```bash
npm install -g yumoframe
yumoframe --version
yumoframe doctor

# 安装 Skill
npx skills add yuchenii/YumoFrame --skill yumoframe
```

`doctor` 会检查 [Node](https://nodejs.org/zh-cn/download)、[uv](https://docs.astral.sh/uv/getting-started/installation/)、[ffmpeg](https://ffmpeg.org/download.html)、内置模板和 ASR/TTS processor。纯文字可以不装 uv / ffmpeg；本地 Qwen3-TTS 需要 uv，音视频转写需要 uv 和 ffmpeg。命令说明见 `yumoframe --help`。

## 怎么用

在项目目录里直接说目标即可，例如：

- 「用这段文案做一条 rotating-flow 竖屏视频：……」
- 「把这段短句做成 center-line 的 echo 效果。」
- 「把这段对话做成 chat-bubbles 聊天视频。」
- 「用 `assets/source.mp3` 做视频，保留原声。」
- 「把 `text.txt` 合成语音后再做一条有声视频。」

创建项目时选择数据结构对应的 Template；只有 `center-line` 还可选择同一数据结构下的视觉 Preset：

```bash
yumoframe init ./rotating-demo --template rotating-flow
yumoframe init ./center-demo --template center-line --preset echo
yumoframe init ./chat-demo --template chat-bubbles
```

文本、语音合成和音视频共用同一条创作链路，差别主要是声轨从哪来：

| 输入 | 流程概要 | 建议确认的节点 |
| --- | --- | --- |
| 文本 | `init` → 按 Template Guide 写作者数据（需要时含时间/持续时间）→ `resolve` → `validate` → `studio` → `render` | 作者数据、studio 预览；同意后再 render |
| 文本转语音 | `init` → 写 `text.txt` 并 `synthesize`（出声轨**+时间**；无时间戳时才用 `transcribe` 兜底）→ 校对 → `sync` → 写 lines/storyboard（**不要编时钟**）→ `resolve` → … | 合成声轨试听、`project.md`、studio 预览 |
| 音视频 | `init` → 放媒体并 `transcribe` → 校对 `transcript.md` → `sync` → 写 lines/storyboard（**不要编时钟**）→ `resolve` → `validate` → `studio` → `render` | 转写校对、`project.md`、studio 预览；同意后再 render |

`synthesize`（别名 `tts`）用 `processors.tts` 把文本合成为声轨（默认写到 `paths.media`）。时间只来自 transcript、不凭空编；TTS 场景尽量不走 ASR 回环，详见 [语音合成指南](docs/tts.md)。

Skill 会要求逐步停顿确认，不会擅自连跑 validate → studio → render。

## 主要文件

| 文件 | 说明 |
| --- | --- |
| `transcript.md` | 转写校对稿。只改 `校对：`，保留时钟和 `原文：`；确认后执行 `yumoframe sync transcript` |
| `project.md` | `rotating-flow` 的可读分镜预览；其他 Template 不强制使用 |
| `lines.json` | `rotating-flow` 的扁平断行中间态；其他 Template 不使用 |
| `storyboard.json` | Template 自己的作者契约：`scenes[]`、`lines[]` 或 `participants[] + messages[]`；有 transcript 时不要编时钟 |
| `transcript.json` / `project.json` | CLI 生成的机器文件；`project.json` 不要手改 |

需要时也可以自己跑：

```bash
yumoframe validate
yumoframe studio   # 别名：yumoframe dev
yumoframe render   # 预览确认后再渲染
```

## 其他命令

```bash
yumoframe templates       # 列出内置模板
yumoframe inspect --json  # 机器可读：当前项目的模板契约与能力（Skill 首选）
yumoframe layout          # rotating-flow 专属 SVG 布局预览
yumoframe eject           # 把运行时模板拷进当前项目
yumoframe doctor          # 检查 Node、uv、ffmpeg、模板与 processors
```

只有需要改模板源码时才用 `eject`。正常项目保持纯数据即可。

## 语音合成（TTS）

`synthesize`（别名 `tts`）用 `processors.tts` 把文本合成为声轨。按 `runner` 选择引擎：

| runner    | 用途                                  | 用户需要         |
| --------- | ------------------------------------- | ---------------- |
| `uv`      | 包内本地引擎（默认 Qwen3-TTS）        | uv；首次会下模型 |
| `command` | 外部 CLI（如 `uvx edge-tts`）         | 有 uv 即可       |
| `api`     | 线上 TTS（DashScope / OpenAI 兼容等） | API key          |

默认新项目：本地 Qwen3-TTS 0.6B + Vivian，并用 FunASR `fa-zh` 给已知原文标时间。Skill 配音流程必须先审核 `speech.json`，再 `yumoframe synthesize --plan`；也可用裸 `synthesize` 做整段合成。

```bash
yumoframe synthesize --capabilities   # 查看当前模型允许的 control
yumoframe synthesize --plan speech.json
```

时间来源按字幕 → 强制对齐 → ASR 三档自动降级，尽量避免「TTS 后再 ASR」造成原文漂移。

完整配置（模型表、edge-tts / DashScope 示例、表演计划、对齐降级）见 **[语音合成指南](docs/tts.md)**。

## 文档

- [语音合成指南](docs/tts.md) — runner、模型、speech.json、时间降级
- [开发指南](docs/development.md) — 环境、编译、本地 Skill、测试、打包内容
- [架构说明](docs/architecture.md) — 包结构与纯数据项目
