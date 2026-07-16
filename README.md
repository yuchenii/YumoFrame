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

# 安装 Skill
npx skills add yuchenii/YumoFrame --skill yumoframe-comedy-text
```

`doctor` 会检查 [Node](https://nodejs.org/zh-cn/download)、[uv](https://docs.astral.sh/uv/getting-started/installation/)、[ffmpeg](https://ffmpeg.org/download.html)、内置模板和 ASR/TTS processor。纯文字可以不装 uv / ffmpeg；本地 Qwen3-TTS 需要 uv，音视频转写需要 uv 和 ffmpeg。命令说明见 `yumoframe --help`。

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
yumoframe doctor          # 检查 Node、uv、ffmpeg、模板与 processors
```

只有需要改模板源码时才用 `eject`。正常项目保持纯数据即可。

## 语音合成（TTS）

`processors.tts` 和 `processors.asr` 共用同一形状，按 `runner` 选择引擎：

| runner | 用途 | 用户需要 |
|--------|------|----------|
| `uv` | 包内本地引擎（默认 Qwen3-TTS；FunASR 也走这条） | 只需 uv，venv 自动缓存 |
| `command` | 外部 CLI，用 `{text}` / `{out}` 占位符（如 `uvx edge-tts`） | 装了 uv 即免安装，`uvx` 首次自动拉取 |
| `api` | 线上 TTS（阿里云原生 Qwen-TTS、OpenAI 兼容接口等） | 只设一个 API key，连 uv 都不用 |

`init` 默认使用本地 `Qwen/Qwen3-TTS-12Hz-0.6B-CustomVoice`，语言 `Chinese`、普通话女声 `Vivian`，输出到 `assets/input.wav`。首次运行会创建独立缓存 venv 并下载模型；模型权重不进入 npm 包。默认同时配置 FunASR `fa-zh`，用“生成音频 + 原始文本”直接做强制对齐，不把音频重新识别成文字。

本地 Qwen3-TTS 可选模型：

| 模型 | 适合 | 必要配置 |
|------|------|----------|
| `Qwen/Qwen3-TTS-12Hz-0.6B-CustomVoice`（默认） | 更快、更省内存；使用 Vivian 等内置音色 | `speaker`，可选 `instruct` |
| `Qwen/Qwen3-TTS-12Hz-1.7B-CustomVoice` | 更看重质量，仍使用内置音色 | `speaker`，可选 `instruct` |
| `Qwen/Qwen3-TTS-12Hz-1.7B-VoiceDesign` | 用自然语言设计新音色与表达风格 | 必须提供 `instruct`；不使用 `speaker` |
| `Qwen/Qwen3-TTS-12Hz-1.7B-Base` | 用参考音频克隆声音 | 必须提供 `refAudio`；建议同时提供 `refText` |

官方没有给出可靠的显存门槛。没有可用加速器或优先速度时选 0.6B；检测到 CUDA/MPS、愿意承担更高内存与等待时间且更重视质量时，可选 1.7B。VoiceDesign/Base 按用途选择，不应只看参数量。

```jsonc
// 1.7B 内置音色
"options": {"model": "Qwen/Qwen3-TTS-12Hz-1.7B-CustomVoice", "language": "Chinese", "speaker": "Vivian", "device": "auto"}

// 1.7B 音色设计
"options": {"model": "Qwen/Qwen3-TTS-12Hz-1.7B-VoiceDesign", "language": "Chinese", "instruct": "清晰自然、亲切的普通话年轻女声", "device": "auto"}

// 1.7B 声音克隆；refAudio 相对项目配置目录解析
"options": {"model": "Qwen/Qwen3-TTS-12Hz-1.7B-Base", "language": "Chinese", "refAudio": "assets/reference.wav", "refText": "参考音频的逐字稿", "device": "auto"}
```

Base 未提供 `refText` 时会退化为仅提取说话人特征，质量通常较低；参考音频处理可能需要系统 SoX（macOS：`brew install sox`）。

`options.model` 既可写 Hugging Face 模型 ID，也可写已下载的本地 snapshot 目录；只要路径保留官方目录名中的 `-CustomVoice`、`-VoiceDesign` 或 `-Base`，YumoFrame 与 Python processor 都会识别对应能力，不会重新下载权重。

想用更轻量的 edge-tts，把 `tts` 改成下面的可选配置。它会同时生成字幕，因此时间轴直接走第 1 档：

```jsonc
"tts": {
  "runner": "command",
  "profile": "edge-tts",
  "command": ["uvx", "--from", "edge-tts>=7.2.8", "edge-tts", "--voice", "zh-CN-YunxiNeural", "--text", "{text}", "--write-media", "{out}", "--write-subtitles", "{subs}"]
}
```

edge-tts 依赖微软在线服务，旧版本可能因 token 轮换报 `403`；遇到时用 `uvx --refresh …` 或抬高版本下限。它输出 MP3；切换时也把 `paths.media` 改成 `assets/input.mp3`，不要让扩展名和文件内容不一致。换线上 API 则使用：

```jsonc
"tts": {
  "runner": "api",
  "provider": "dashscope",
  "model": "qwen3-tts-instruct-flash",
  "voice": "Cherry",
  "apiKeyEnv": "DASHSCOPE_API_KEY",  // key 只存环境变量，不进配置
  "options": {"languageType": "Chinese"}
}
```

`dashscope`（兼容旧配置名 `qwen3-tts`）直接调用[阿里云原生 Qwen-TTS HTTP API](https://help.aliyun.com/zh/model-studio/qwen-tts-api)，并下载返回的临时音频 URL。`qwen3-tts-instruct-flash` 支持分段指令；改为 `qwen3-tts-flash` 时只支持整段合成。其他 API provider 继续保留各自路径。

DashScope 默认使用北京地域的 API 根路径 `https://dashscope.aliyuncs.com/api/v1`。切换地域时通过 `baseUrl` 配置对应根路径，并使用同地域的 API key。当前 `options` 读取 `languageType`、`instructions` 和 `optimizeInstructions`：整段合成可为 instruct 模型设置全局 `instructions`；分段合成由 `speech.json` 逐段提供指令；布尔值 `optimizeInstructions` 保持为全局设置，并且请求中必须有全局或分段 `instructions`。`languageType` 可选 `Auto`、`Chinese`、`English`、`German`、`Italian`、`Portuguese`、`Spanish`、`Japanese`、`Korean`、`French`、`Russian`。

```bash
yumoframe synthesize                       # 读 paths.ttsText（默认 text.txt）；别名 yumoframe tts
yumoframe synthesize --text "行内文本"      # 直接给文本
yumoframe synthesize --out out/voice.wav   # 指定输出
```

合成输出必须位于项目目录内。音频写入成功后，CLI 会自动把实际项目相对路径同步到 `paths.media` 和 `paths.voice`；之后运行 `resolve` 即会把它作为旁白挂到 `project.json`，无需复制文件或手改配置。

### TTS 表演计划

在 `yumoframe-comedy-text` Skill 的配音流程中，`speech.json` 是必需的：Agent 要先按句号、逗号、分号、冒号、破折号等自然边界把原文拆成短的不可改写单元；若单元内部仍有说话人、情绪、重音或语速变化，还要在不改动任何字符的前提下继续拆分。分析完成后展示完整计划，用户确认后才执行。裸 `yumoframe synthesize` 仅作为 Skill 之外的 CLI 兼容路径保留。

```bash
yumoframe synthesize --capabilities       # 只查看当前模型支持的 control，不加载模型
yumoframe synthesize --plan speech.json   # 按审核后的计划分段生成、合并、对齐
```

`text.txt` 始终是原文，模型仍配置在 `yumoframe.config.json` 的 `processors.tts`。`speech.json` 只保存分段表演方案：通用 `intent`（情绪、强度、速度、备注）和当前模型专用的 `control`。`--capabilities` 会同时返回允许的 control、必填配置、字段约束和示例。代码会在下载模型或调用 API 前校验文本完全一致、control 与模型匹配、必要配置和参数范围；不支持的语气不会被静默忽略。

当前可执行引擎的 control 对照如下；运行时仍以 `yumoframe synthesize --capabilities` 的输出为准：

| 引擎 / 模型 | control | 分段执行 |
|-------------|---------|----------|
| Qwen3-TTS CustomVoice | `qwen-instruct` | 本地一次加载、批量生成 |
| Qwen3-TTS VoiceDesign | `qwen-voice-design` | 本地一次加载、批量生成 |
| Qwen3-TTS Base | `none` | 本地批量生成，仅中性表达 |
| edge-tts（`edge-tts` profile） | `edge-prosody` | 顺序生成 |
| DashScope `qwen3-tts-instruct-flash` | `dashscope-instruct` | 顺序调用 API |
| DashScope `qwen3-tts-flash` | `none` | 仅整段、中性表达 |
| OpenAI `gpt-4o-mini-tts` | `openai-speech` | 顺序调用 API |

本地 Qwen 对整个计划只加载一次模型，并使用批量 API 输出片段；VoiceDesign 会把计划中唯一的 `voice.description` 自动加到每段语气指令前，减少分段间音色漂移。线上分段 profile 按顺序调用 API。每个片段在合并前分别用 FunASR `fa-zh` 对齐，然后按前面片段的真实音频时长和 `pauseAfterMs` 累加偏移；ffmpeg 再用同一批片段合成最终音轨。这样不会把跨段停顿压进全文时间轴，也不会按字数估算时间。

### 时间从哪来（自动三档降级）

`文本 → TTS → ASR → 文本` 不是无损的（同音字、数字、增漏字），所以 TTS 场景**尽量不走 ASR**：

| 档 | 条件 | 做法 | 会不会对不上 |
|----|------|------|--------------|
| 1 | TTS 能出时间戳 | 命令里带 `{subs}`（如 edge-tts `--write-subtitles`）→ 字幕直接转 `transcript.json` | 不会（同源） |
| 2 | 只有音频、但原文已知 | 配 `processors.align`（分段计划逐片对齐；兼容路径整段对齐）→ 校验后写 `transcript.json` | 文字已知，但时间仍需校验 |
| 3 | 都没有 | 事后跑 `yumoframe transcribe`（ASR）→ 校对 | 会，靠校对补 |

默认 Qwen3-TTS 只回音频，但新项目已配置 FunASR `fa-zh`，会自动走第 2 档。对齐结果缺时间戳、token 数不符、越界、不单调或留下异常长的未覆盖尾音时，CLI 会放弃该结果并用已配置的 ASR 对最终音频兜底；因此即使对齐输出复现了全文，也不能只凭文字一致判定成功。可选 edge-tts 命令带 `{subs}`，会直接走第 1 档。默认对齐配置如下：

强制对齐保留字级时间戳，并按标点把已知原文拆成可校对的 `transcript.md` 段落；整篇文案落成一个段落表示标点/token 与时间戳数量不匹配，不应视为正常结果。

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
