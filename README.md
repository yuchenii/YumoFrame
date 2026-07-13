# YumoFrame

[English](README.en.md) | 中文

[![npm version](https://img.shields.io/npm/v/yumoframe.svg?style=flat)](https://www.npmjs.com/package/yumoframe)
[![npm downloads](https://img.shields.io/npm/dm/yumoframe.svg?style=flat)](https://www.npmjs.com/package/yumoframe)
[![skills.sh](https://skills.sh/b/yuchenii/YumoFrame)](https://skills.sh/yuchenii/YumoFrame)

YumoFrame 是基于 Remotion 的 CLI，用结构化项目数据制作可复用的竖屏视频。

v0.1 提供 `comedy-text` 模板：黑底、粗体中文、薄荷绿高亮、打字机揭示、光标块、场景旋转与自动镜头适配。

日常用法是：装好工具 → 把需求交给 Agent → 在关键节点确认与修改一下 → 预览满意后再渲染。断行、高亮、分镜交给 Agent；不要手写 `project.json`。

## 安装

```bash
npm install -g yumoframe
yumoframe --version
yumoframe doctor

# 安装创作 Skill（当前项目）
npx skills add yuchenii/YumoFrame --skill yumoframe-comedy-text
```

`doctor` 会检查 [Node](https://nodejs.org/zh-cn/download)、[uv](https://docs.astral.sh/uv/getting-started/installation/)、[ffmpeg](https://ffmpeg.org/download.html)、内置模板和 ASR processor。纯文字可以不装 uv / ffmpeg；音视频转写两者都需要。命令说明见 `yumoframe --help`。

## 怎么用

在项目目录里直接说目标即可，例如：

- 「用这段文案做一条 comedy-text 竖屏视频：……」
- 「用 `assets/source.mp3` 做视频，保留原声。」
- 「把 `text.txt` 合成语音后再做一条有声视频。」

文本、语音合成和音视频共用同一条创作链路，差别主要是声轨从哪来：

| 输入 | 流程概要 | 建议确认的节点 |
|------|----------|----------------|
| 文本 | `init` → 写 `lines.json` / `storyboard.json`（含时间）→ `resolve` → `validate` → `studio` → `render` | `project.md`、studio 预览；同意后再 render |
| 文本转语音 | `init` → 写 `text.txt` 并 `synthesize`（出声轨**+时间**；无时间戳时才用 `transcribe` 兜底）→ 校对 → `sync` → 写 lines/storyboard（**不要编时钟**）→ `resolve` → … | 合成声轨试听、`project.md`、studio 预览 |
| 音视频 | `init` → 放媒体并 `transcribe` → 校对 `transcript.md` → `sync` → 写 lines/storyboard（**不要编时钟**）→ `resolve` → `validate` → `studio` → `render` | 转写校对、`project.md`、studio 预览；同意后再 render |

`synthesize`（别名 `tts`）用 `processors.tts` 把文本合成为声轨（默认写到 `paths.media`）。时间只来自 transcript、不凭空编，但**TTS 场景尽量不走 ASR 回环**（避免"原文↔识别文本"对不上），按下面三档自动降级取时间。

Skill 会要求逐步停顿确认，不会擅自连跑 validate → studio → render。

## 主要文件

| 文件 | 说明 |
|------|------|
| `transcript.md` | 转写校对稿。只改 `校对：`，保留时钟和 `原文：`；确认后执行 `yumoframe sync transcript` |
| `project.md` | 可读的分镜预览。可调整场景分组、文案和 `**highlight**`；标题里的时钟 / `rotate` 仅供展示 |
| `lines.json` / `storyboard.json` | 断行、高亮与分镜的作者文件，由 Agent 维护；有转写时不要填 `start`/`end` |
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
yumoframe layout          # 写出 SVG 布局预览
yumoframe eject           # 把运行时模板拷进当前项目
yumoframe doctor          # 检查 Node、uv、ffmpeg、模板与 ASR
```

只有需要改模板源码时才用 `eject`。正常项目保持纯数据即可。

## 语音合成（TTS）

`processors.tts` 和 `processors.asr` 共用同一形状，按 `runner` 选择引擎：

| runner | 用途 | 用户需要 |
|--------|------|----------|
| `api` | 线上 TTS，OpenAI 兼容 `/audio/speech`（qwen3-tts、openai 等） | 只设一个 API key，连 uv 都不用 |
| `command` | 外部 CLI，用 `{text}` / `{out}` 占位符（如 `uvx edge-tts`） | 装了 uv 即免安装，`uvx` 首次自动拉取 |
| `uv` | 本地引擎（funasr 走这条；本地 TTS 待内置） | 只需 uv，venv 自动缓存 |

`init` 默认给的是 edge-tts（`command` + `uvx --from 'edge-tts>=7.2.8'`，免安装、无需 key）。edge-tts 是逆向微软在线服务，旧版本会因 token 轮换报 `403`——默认已锁版本下限；若日后再 403，用 `uvx --refresh …` 或抬高下限即可。换线上把 `tts` 改成：

```jsonc
"tts": {
  "runner": "api",
  "provider": "qwen3-tts",
  "model": "qwen3-tts-flash",
  "voice": "Cherry",
  "apiKeyEnv": "DASHSCOPE_API_KEY"   // key 只存环境变量，不进配置
}
```

```bash
yumoframe synthesize                       # 读 paths.ttsText（默认 text.txt）；别名 yumoframe tts
yumoframe synthesize --text "行内文本"      # 直接给文本
yumoframe synthesize --out out/voice.wav   # 指定输出
```

### 时间从哪来（自动三档降级）

`文本 → TTS → ASR → 文本` 不是无损的（同音字、数字、增漏字），所以 TTS 场景**尽量不走 ASR**：

| 档 | 条件 | 做法 | 会不会对不上 |
|----|------|------|--------------|
| 1 | TTS 能出时间戳 | 命令里带 `{subs}`（如 edge-tts `--write-subtitles`）→ 字幕直接转 `transcript.json` | 不会（同源） |
| 2 | 只有音频、但原文已知 | 配 `processors.align`（强制对齐：音频 + 已知文本）→ `transcript.json` | 不会（文本是给定的） |
| 3 | 都没有 | 事后跑 `yumoframe transcribe`（ASR）→ 校对 | 会，靠校对补 |

默认 edge-tts 命令已带 `{subs}`，走第 1 档，开箱即不经过 ASR。API 只回音频时配强制对齐器补第 2 档——funasr 已内置对齐模式：

```jsonc
"align": {
  "runner": "uv",
  "name": "funasr",
  "options": {"model": "fa-zh"}   // 用对齐模型给"已知文本"标时间；不猜文字
}
// 或用外部对齐器：
"align": {"runner": "command", "command": ["my-aligner"]}  // 收 audioPath textPath outputBase，写出 transcript.json
```

`options` 里的键会透传成 `--kebab` flag，所以本地 uv 引擎可以指定模型：ASR 用 `{"model":"paraformer-zh-streaming"}`、对齐用 `{"model":"fa-zh"}` 等。

`synthesize` 若产出了 `transcript.json`，接着 `resolve → render`；否则先 `transcribe`。

## 文档

- [开发指南](docs/development.md) — 环境、编译、本地 Skill、测试、打包内容
- [架构说明](docs/architecture.md) — runtime 与纯数据项目
