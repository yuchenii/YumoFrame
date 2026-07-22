# 语音合成（TTS）用户指南

本文是面向用户的 TTS 配置与使用说明。设计动机与实现取舍见 `docs/superpowers/specs/` 下相关设计稿。

返回：[README（中文）](../README.md)

## 引擎选择（runner）

`processors.tts` 和 `processors.asr` 共用同一形状，按 `runner` 选择引擎：

| runner | 用途 | 用户需要 |
| --- | --- | --- |
| `uv` | 包内本地引擎（默认 Qwen3-TTS；FunASR 也走这条） | 只需 uv，venv 自动缓存 |
| `command` | 外部 CLI，用 `{text}` / `{out}` 占位符（如 `uvx edge-tts`） | 装了 uv 即免安装，`uvx` 首次自动拉取 |
| `api` | 线上 TTS（阿里云原生 Qwen-TTS、OpenAI 兼容接口等） | 只设一个 API key，连 uv 都不用 |

`init` 默认使用本地 `Qwen/Qwen3-TTS-12Hz-0.6B-CustomVoice`，语言 `Chinese`、普通话女声 `Vivian`，输出到 `assets/input.wav`。首次运行会创建独立缓存 venv 并下载模型；模型权重不进入 npm 包。默认同时配置 FunASR `fa-zh`，用“生成音频 + 原始文本”直接做强制对齐，不把音频重新识别成文字。

本地模型的可选仓库由 `tts-profiles.json` 的 `sources` 数组声明，`modelSource` 负责选择；未指定时优先 ModelScope，没有 ModelScope 条目才使用数组首项。processor 只检查并继续所选来源的缓存；目录中只有半截文件时不会当成完整模型，404 或网络错误也不会自动换源。

## 本地 Qwen3-TTS 模型

本地 Qwen3-TTS 可选模型：

| 模型 | 适合 | 必要配置 |
| --- | --- | --- |
| `Qwen/Qwen3-TTS-12Hz-0.6B-CustomVoice`（默认） | 更快、更省内存；使用 Vivian 等内置音色 | `speaker`，可选 `instruct` |
| `Qwen/Qwen3-TTS-12Hz-1.7B-CustomVoice` | 更看重质量，仍使用内置音色 | `speaker`，可选 `instruct` |
| `Qwen/Qwen3-TTS-12Hz-1.7B-VoiceDesign` | 用自然语言设计新音色与表达风格 | 必须提供 `instruct`；不使用 `speaker` |
| `Qwen/Qwen3-TTS-12Hz-1.7B-Base` | 用参考音频克隆声音 | 必须提供 `refAudio`；建议同时提供 `refText` |

官方没有给出可靠的显存门槛。没有可用加速器或优先速度时选 0.6B；检测到 CUDA/MPS、愿意承担更高内存与等待时间且更重视质量时，可选 1.7B。VoiceDesign/Base 按用途选择，不应只看参数量。

```jsonc
// 1.7B 内置音色
"options": {"model": "Qwen/Qwen3-TTS-12Hz-1.7B-CustomVoice", "modelSource": "modelscope", "language": "Chinese", "speaker": "Vivian", "device": "auto"}

// 1.7B 音色设计
"options": {"model": "Qwen/Qwen3-TTS-12Hz-1.7B-VoiceDesign", "language": "Chinese", "instruct": "清晰自然、亲切的普通话年轻女声", "device": "auto"}

// 1.7B 声音克隆；refAudio 相对项目配置目录解析
"options": {"model": "Qwen/Qwen3-TTS-12Hz-1.7B-Base", "language": "Chinese", "refAudio": "assets/reference.wav", "refText": "参考音频的逐字稿", "device": "auto"}
```

Base 未提供 `refText` 时会退化为仅提取说话人特征，质量通常较低；参考音频处理可能需要系统 SoX（macOS：`brew install sox`）。

`options.model` 既可写模型目录中的 ID，也可写已下载的本地 snapshot 目录；相对本地路径需显式使用 `./` 或 `../`（Windows 使用 `.\\` 或 `..\\`），避免与 `org/name` Hub ID 混淆。只要路径保留官方目录名中的 `-CustomVoice`、`-VoiceDesign` 或 `-Base`，YumoFrame 与 Python processor 都会识别对应能力，不会重新下载权重。下载器版本由包内 `uv.lock` 锁定，用户机器只需要 `uv`，不需要 `mise` 或单独安装 ModelScope/Hugging Face CLI。

## 可选引擎（edge-tts / API）

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

`dashscope` 直接调用[阿里云原生 Qwen-TTS HTTP API](https://help.aliyun.com/zh/model-studio/qwen-tts-api)，并下载返回的临时音频 URL。`qwen3-tts-instruct-flash` 支持分段指令；改为 `qwen3-tts-flash` 时只支持整段合成。其他 API provider 继续保留各自路径。

DashScope 默认使用北京地域的 API 根路径 `https://dashscope.aliyuncs.com/api/v1`。切换地域时通过 `baseUrl` 配置对应根路径，并使用同地域的 API key。当前 `options` 读取 `languageType`、`instructions` 和 `optimizeInstructions`：整段合成可为 instruct 模型设置全局 `instructions`；分段合成由 `speech.json` 逐段提供指令；布尔值 `optimizeInstructions` 保持为全局设置，并且请求中必须有全局或分段 `instructions`。`languageType` 可选 `Auto`、`Chinese`、`English`、`German`、`Italian`、`Portuguese`、`Spanish`、`Japanese`、`Korean`、`French`、`Russian`。

## 常用命令

```bash
yumoframe synthesize                       # 读 paths.ttsText（默认 text.txt）；别名 yumoframe tts
yumoframe synthesize --text "行内文本"      # 直接给文本
yumoframe synthesize --out out/voice.wav   # 指定输出
```

合成输出必须位于项目目录内。音频写入成功后，CLI 会自动把实际项目相对路径同步到 `paths.media` 和 `paths.voice`；之后运行 `resolve` 即会把它作为旁白挂到 `project.json`，无需复制文件或手改配置。

## TTS 表演计划

在 `yumoframe` Skill 的配音流程中，`speech.json` 是必需的：Agent 要先按句号、逗号、分号、冒号、破折号等自然边界把原文拆成短的不可改写单元；若单元内部仍有说话人、情绪、重音或语速变化，还要在不改动任何字符的前提下继续拆分。分析完成后展示完整计划，用户确认后才执行。Skill 外也可直接用裸 `yumoframe synthesize` 做整段合成。

```bash
yumoframe synthesize --capabilities       # 只查看当前模型支持的 control，不加载模型
yumoframe synthesize --plan speech.json   # 按审核后的计划分段生成、合并、对齐
```

`text.txt` 始终是原文，模型仍配置在 `yumoframe.config.json` 的 `processors.tts`。`speech.json` 只保存分段表演方案：通用 `intent`（情绪、强度、速度、备注）和当前模型专用的 `control`。`--capabilities` 会同时返回允许的 control、必填配置、字段约束和示例。代码会在下载模型或调用 API 前校验文本完全一致、control 与模型匹配、必要配置和参数范围；不支持的语气不会被静默忽略。

当前可执行引擎的 control 对照如下；运行时仍以 `yumoframe synthesize --capabilities` 的输出为准：

| 引擎 / 模型                          | control              | 分段执行                 |
| ------------------------------------ | -------------------- | ------------------------ |
| Qwen3-TTS CustomVoice                | `qwen-instruct`      | 本地一次加载、批量生成   |
| Qwen3-TTS VoiceDesign                | `qwen-voice-design`  | 本地一次加载、批量生成   |
| Qwen3-TTS Base                       | `none`               | 本地批量生成，仅中性表达 |
| edge-tts（`edge-tts` profile）       | `edge-prosody`       | 顺序生成                 |
| DashScope `qwen3-tts-instruct-flash` | `dashscope-instruct` | 顺序调用 API             |
| DashScope `qwen3-tts-flash`          | `none`               | 仅整段、中性表达         |
| OpenAI `gpt-4o-mini-tts`             | `openai-speech`      | 顺序调用 API             |

本地 Qwen 对整个计划只加载一次模型，并使用批量 API 输出片段；VoiceDesign 会把计划中唯一的 `voice.description` 自动加到每段语气指令前，减少分段间音色漂移。线上分段 profile 按顺序调用 API。每个片段在合并前分别用 FunASR `fa-zh` 对齐，然后按前面片段的真实音频时长和 `pauseAfterMs` 累加偏移；ffmpeg 再用同一批片段合成最终音轨。这样不会把跨段停顿压进全文时间轴，也不会按字数估算时间。

## 时间从哪来（自动三档降级）

`文本 → TTS → ASR → 文本` 不是无损的（同音字、数字、增漏字），所以 TTS 场景**尽量不走 ASR**：

| 档 | 条件 | 做法 | 会不会对不上 |
| --- | --- | --- | --- |
| 1 | TTS 能出时间戳 | 命令里带 `{subs}`（如 edge-tts `--write-subtitles`）→ 字幕直接转 `transcript.json` | 不会（同源） |
| 2 | 只有音频、但原文已知 | 配 `processors.align`（分段计划逐片对齐，或整段对齐）→ 校验后写 `transcript.json` | 文字已知，但时间仍需校验 |
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

`options` 里的键会透传成 `--kebab` flag，所以本地 uv 引擎可以指定模型：ASR 用 `{"model":"paraformer-zh-streaming"}`、对齐用 `{"model":"fa-zh"}` 等。FunASR 默认通过官方 `hub="ms"` 使用 ModelScope；仅在明确配置 `"modelSource":"huggingface"` 时改用 `hub="hf"`。

`synthesize` 若产出了 `transcript.json`，接着 `resolve → render`；否则先 `transcribe`。

## 相关设计文档

- [分段 TTS 交付](superpowers/specs/2026-07-15-segmented-tts-delivery-design.md)
- [分段对齐](superpowers/specs/2026-07-16-segmented-tts-alignment-design.md)
- [Qwen3-TTS processor](superpowers/specs/2026-07-14-qwen3-tts-processor-design.md)
