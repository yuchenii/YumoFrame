# 分段 TTS 对齐设计

## 问题

当前分段情绪 TTS 会先合并所有生成片段和配置的停顿，再将完整音轨与已知原文做一次强制对齐。FunASR 可能返回原文的全部文字，却把较长的停顿压缩掉。因此，文字一致并不能证明时间戳正确。

已复现项目的数据如下：

- 选择的 TTS：`Qwen/Qwen3-TTS-12Hz-1.7B-CustomVoice`，音色 `Vivian`；
- 最终 WAV 时长：58.68 秒；
- 强制对齐的最后时间戳：46.89 秒；
- 独立 ASR 识别到的最后语音：约 58.50 秒；
- 最终生成的视频时长：48.4 秒。

随后，创作 Skill 因为 `transcript.md` 与 `text.txt` 一致，就把校对判断为成功。但这只能证明它输出了已经知道的原文，不能证明文字落在了正确的音频位置。

## 目标

1. 在插入跨段停顿前，对每个 TTS 生成片段分别计算时间。
2. 拒绝明显不合理的强制对齐结果，并自动降级到已配置的 ASR 处理器。
3. 最终视频不得短于正在使用的 TTS 音轨。
4. Skill 在推荐或执行前，必须发现并明确当前 provider、processor、model、voice、device 和时间生成策略。
5. 不改变现有音频/视频转视频流程。

不实现全局时间戳缩放，也不引入由 YumoFrame 管理的常驻 TTS/ASR 服务。

## 数据来源

- `yumoframe.config.json`：选择当前 TTS processor/provider、模型、音色、设备、ASR 和对齐器。
- `text.txt`：唯一的朗读原文。
- `speech.json`：Skill 配音流程的必需作者输入，描述表演分段和停顿，但不得提供时间戳。裸 CLI 无 plan 的整段合成只作为兼容路径保留。
- 生成的音频片段：提供每段的真实时长。
- `transcript.json`：仍然是画面文字时间的唯一来源。

`yumoframe synthesize --capabilities` 必须同时返回解析后的能力 profile 和真实配置的安全摘要。对于复现项目，它必须明确显示 `uv / qwen3-tts / 1.7B-CustomVoice / Vivian / auto`，不能只返回一个 profile ID。不得输出密钥或环境变量的值。

## 模型与音色发现

最初的需求只说了“使用 Qwen3-TTS 1.7B”。这不是完整选择，因为支持的三个 1.7B 模型用途不同：

- `Qwen/Qwen3-TTS-12Hz-1.7B-CustomVoice`：选择内置音色，可以附加表演指令；
- `Qwen/Qwen3-TTS-12Hz-1.7B-VoiceDesign`：用自然语言设计新音色，不使用预置 speaker；
- `Qwen/Qwen3-TTS-12Hz-1.7B-Base`：根据参考音频和对应文本克隆音色。

上一次执行虽然在合成前把配置改成了 1.7B，但在用户只指定模型大小的情况下，擅自选择了 CustomVoice 和 Vivian，这个流程不正确。

应扩展现有 `runtime/processors/tts-profiles.json`，把 YumoFrame 真正支持的模型 ID 和已知预置音色放进同一个运行时能力来源，不能再在 Skill 中复制一张容易过期的表。

Qwen CustomVoice 的能力目录应包含官方九种音色及其说明和母语：Vivian、Serena、Uncle_Fu、Dylan、Eric、Ryan、Aiden、Ono_Anna、Sohee。目录只列出 YumoFrame 实际支持的模型和音色。

`yumoframe synthesize --capabilities` 返回：

- `selected`：当前配置的 runner/provider、processor、model、profile、language、voice/speaker 和 device；
- `available`：兼容的模型变体，以及 CustomVoice 对应的预置音色；
- 现有的执行方式、时间策略、必填配置和语气控制约束。

该命令必须保持只读，不加载模型，也不检查已经下载的模型缓存。未知或自定义处理器只返回当前配置和保守能力，Skill 不得自行编造可选模型或音色。

`init` 继续生成确定且可直接运行的默认配置：0.6B CustomVoice + Vivian。对于明确的 TTS 需求，该默认值不能被当成用户已经做出的选择：

1. 用户给出了完整模型变体和必需的音色输入时，立即更新 `yumoframe.config.json`，再用 `--capabilities` 校验。
2. 用户只给出模型系列或大小，例如“1.7B”时，展示兼容的模型变体并询问用途。
3. 用户选择 CustomVoice 但没有指定 speaker 时，展示预置音色并让用户选择。
4. 只有模型和音色选择完整后，才能创建语气控制或开始合成。

编辑 `yumoframe.config.json` 是项目配置的正常方式。增加另一套 `init --tts-*` 参数会重复配置契约，不在本次范围内。

## 输入分支隔离

Skill 必须先判断输入类型，再执行后续流程：

- 文本转语音：进入本文设计的模型/音色选择、合成和对齐流程；
- 已有音频或视频：保持现有 `transcribe -> transcript 校对 -> sync -> 创作 -> resolve -> Studio` 流程；
- 不需要语音的纯文本：保持现有的人工编排时间流程。

音频/视频输入不得查询 TTS 能力目录、检查 GPU、修改 `processors.tts`、创建 `speech.json` 或运行 `synthesize`。新的分段对齐入口只能由 `synthesize` 调用；现有 `transcribe` 命令和 ASR 标准化逻辑保持不变。

## 时间生成流程

### 分段合成

1. 先在句号、逗号、分号、冒号、破折号等自然边界把原文拆成不可改写的短交付单元；若单元内部仍有说话人、情绪、重音或语速变化，则在对应字符边界继续拆分；不把多个单元重新合成一个长 segment。
2. 使用现有支持 plan 的 TTS 执行路径生成所有音频片段。
3. 删除临时片段前，把每个片段路径和对应原文组成一个 manifest，交给同一个 FunASR 进程。
4. FunASR 只加载一次强制对齐模型，依次对齐每个片段，并分别返回 transcript。
5. 读取每个片段的真实时长，再根据前面片段的累计时长和 `pauseAfterMs` 偏移时间戳。
6. 合并偏移后的 transcript，并将 transcript 总时长设为最终合并音频的真实时长。
7. 使用完全相同的片段和停顿合并最终音轨。

这样既能保留同一表演片段内部的自然停顿，又能避免跨段停顿被整体强制对齐压缩，同时不会为每一段重复加载一次对齐模型。

### 整段合成

保持现有优先级：TTS 原生字幕、整段强制对齐、ASR。整段强制对齐也必须经过下述合理性校验。

### 合理性校验与降级

出现以下任一情况时，强制对齐结果无效：

- 缺少时间戳；
- 时间戳不单调递增；
- 时间戳超出片段真实时长；
- token 数量与原文不匹配；
- 最后时间戳之后存在明显无法解释的长音频。

`pauseAfterMs` 是对齐后才插入的明确停顿，不参与片段尾部校验。生成片段允许最后一个 token 后最多保留 1.5 秒音频。该阈值暂不做成项目配置；只有真实 provider 证明存在更长的有效尾音时，才根据证据调整处理器级阈值。

任一片段或整段对齐校验失败时：

1. 保留已经成功生成的最终音频；
2. 使用现有 `processors.asr` 对最终音频执行 ASR；
3. 写入 ASR 生成的 `transcript.json` 和 `transcript.md`；
4. 明确输出已降级到 ASR，用户必须校对实际朗读文字。

不得混合部分强制对齐结果和部分 ASR 结果，也不得通过拉伸时间戳来填满音频。

## 视频时长

存在 transcript 时，`resolve` 必须保证视频时长同时覆盖最终文字和 `transcript.duration`。这样即使最后一个文字时间戳异常，或者结尾存在有意停顿，也不会提前截断 TTS 音轨。现有结尾 overview 的额外时长继续叠加。

该时长保护只修复 TTS 音轨提前结束的问题，不改变已有音频/视频项目的转录、文字对齐和播放来源。

## Skill 流程

对于 TTS 输入，Skill 必须按以下顺序执行：

1. 先读取 `yumoframe.config.json`。
2. 运行 `yumoframe synthesize --capabilities`，用一个简短摘要展示当前 runner/provider、processor、model、profile、voice、device、aligner 和 ASR。
3. 根据返回的能力目录补全不完整的模型或音色需求，并等待用户明确选择；不能因为用户说“1.7B”就自动选择 CustomVoice 或 Vivian。
4. 更新项目配置，重新运行 capabilities，并在合成前展示最终选择。
5. 只有比较本地模型大小或用户要求更换模型时，才检查硬件；已经明确的选择应保留。
6. 每次 TTS 都按自然句段和分句边界拆分原文、分析意图、只生成当前模型支持的控制字段，展示完整 `speech.json` 并等待确认。不得因为整篇语气近似就省略计划或把多个短单元重新合成长 segment。
7. 运行合成。
8. 读取合成结果摘要：音频时长、时间模式（`native`、`fragment-align`、`whole-align` 或 `asr-fallback`）、最后时间戳和覆盖率。
9. 对齐错误时停止。使用 `asr-fallback` 时展示 `transcript.md` 并要求校对实际朗读内容；强制对齐成功时仍要求抽查播放，不能因为文字复现了 `text.txt` 就宣称成功。
10. transcript 得到确认后，才能创建 `lines.json`、`storyboard.json`，随后运行 resolve 并打开 Studio。

Skill 在确定 runner 是本地处理器前，不得执行通用硬件或依赖检查。API 和 command provider 不需要检查 GPU。

## CLI 输出

合成成功后输出一个紧凑、可稳定解析的摘要，至少包括：

- 音频路径和时长；
- 已配置的 TTS processor/provider、model 和 voice；
- 时间模式；
- transcript 最后时间戳和覆盖率；
- 是否因为降级到 ASR 而必须校对。

Skill 必须以该摘要为执行证据，不能从文件名或 Skill 自己维护的表中猜测当前模型。

## 验证

- FunASR 单元测试：多个模拟片段只创建一个模型实例，并返回有序 transcript。
- Node 集成测试：片段 transcript 按真实片段时长和配置停顿正确偏移。
- 回归测试：构造最后时间戳被压缩的结果，验证自动降级到 ASR。
- resolve 测试：验证 `transcript.duration` 能阻止视频早于 TTS 音频结束。
- capabilities 测试：验证当前模型和音色会输出，但不会泄露密钥。
- 能力目录测试：仅给出 1.7B 时，能从运行时数据发现 CustomVoice、VoiceDesign、Base 和 CustomVoice 音色，而不是依赖 Skill 文案。
- 现有音频/视频 transcribe 和 resolve fixture 保持字节级或结构级不变，并验证不会调用 TTS 能力目录和分段对齐。
- 同步更新 `README.md`、`README.en.md`、分段语气设计和打包 Skill。

自动测试不下载真实模型，不执行真实合成、转录或视频渲染。
