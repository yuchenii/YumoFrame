# YumoFrame 多模板开发路线图

> 状态：已完成  
> 日期：2026-07-17  
> 范围：`rotating-flow`、`center-line`、`chat-bubbles` 三个内置模板的多模板架构

## 1. 目标

将当前专用于 `comedy-text` 的 CLI 改造成支持多个内置模板的视频框架，同时保留现有的数据型项目模式、媒体/TTS 流程、原始音轨播放、Studio 预览确认门禁、本地 `eject` 流程和 npm 安装包行为。

对外只保留三个概念：

- **Template（模板）**：拥有独立的作者数据契约和核心视频语义。
- **Preset（预设）**：同一 Template 内的视觉配置，不改变 Storyboard 契约。
- **Shared code（共享代码）**：内部实现复用，不作为面向用户的运行时概念。

首批三个 Template：

| Template        | 作者数据契约                  | 用途                                   |
| --------------- | ----------------------------- | -------------------------------------- |
| `rotating-flow` | `scenes[].lines[]`            | 旋转画布、动态文字、重点高亮和镜头运动 |
| `center-line`   | `lines[]`                     | 屏幕中央逐行展示，可选文字强调         |
| `chat-bubbles`  | `participants[] + messages[]` | 文字聊天气泡、参与者、停顿和滚动       |

## 2. 原计划内容覆盖情况

原计划的每一部分都在本 Roadmap 中得到保留、合并到更小的实现面，或者在下方明确延期。

| 原计划内容 | 最终处理方式 |
| --- | --- |
| 总体目标和三个首批 Template | 保留 |
| Template / Preset / Shared 的区别 | 保留；主要根据作者数据契约和语义判断 Template |
| 一个通用 YumoFrame Skill | 保留 |
| Web、Electron、Audio API、MCP、市场、远程模板、monorepo 拆分 | 继续排除在本轮范围外 |
| Core + Registry + Runtime 架构 | 保留，但不提前搭建没有调用方的 `core/` 目录 |
| 目标目录结构 | 渐进式引入，不预先创建空的 shared/core 目录 |
| Template Manifest | 缩小后保留；暂缓没有调用方的 `tags`、`capabilities` 和模板独立发布版本 |
| Template Adapter | 缩小后保留，只提供真实命令分发需要的接口 |
| Template Registry | 保留为显式内置 Registry；继续禁止任意 JavaScript 加载 |
| `comedy-text` 重命名 | 直接替换为 `rotating-flow`，不保留别名 |
| 旧项目兼容 | 取消；旧 Template ID 明确报错，不引入兼容分支 |
| `yumoframe migrate` | 延期；首版不兼容旧 ID，也不提供自动迁移 |
| 公共类型与模板类型分离 | 保留 |
| 三种 Storyboard 设计 | 保留；进一步收紧媒体项目的时间规则 |
| Preset 文件和 `echo` | 保留；随 `center-line` 一起实现，不提前建设无使用者的框架 |
| Runtime 共享组件 | 保留，但至少两个真实 Template 复用后才提取 |
| Adapter 驱动命令 | 对公共命令保留 |
| `project inspect` + `template instructions` | 合并为一个 `yumoframe inspect --json` 机器接口 |
| Template 和 Preset 列表 | `templates --json` 返回 Preset ID；独立 `presets` 命令按需再加 |
| 面向多个 Agent 的 CLI Skill 安装器 | 延期；继续使用现有 `npx skills add` 流程 |
| `yumoframe-template-author` Skill | 与第三方模板/模板开发能力一起延期 |
| 布局逻辑合并 | 对 `rotating-flow` 保留；以 resolve 后的渲染属性为唯一数据源 |
| 开发阶段 | 保留，重新组织为纵向切片 |
| Manifest、Adapter、Template、CLI、CI 测试 | 保留；出现真实重复后再提取测试助手 |
| 推荐的 11 个提交 | 调整为 8 个可独立审查的纵向交付项 |
| 完成标准 | 保留，并补充旧命令、打包和安装包验证要求 |

## 3. 首个版本的明确限制

以下内容不是被遗漏，而是明确不在本 Roadmap 范围内：

- 不支持动态安装第三方 Template 或加载可执行 Adapter。
- 在出现真实数据迁移前，不增加 `yumoframe migrate`。
- 不由 CLI 管理 Claude Code、Codex、Cursor 的安装路径。
- 不创建独立的模板开发 Skill。
- 不引入面向用户的模板家族概念。
- 不强迫未使用 `project.md`、`lines.json`、`layout`、`sync project` 的 Template 实现这些通用契约。
- `chat-bubbles` v1 不支持图片、语音、文件、表情包、撤回或应用皮肤。
- 不提前搭建完整的共享组件层级。
- 用户没有确认 Studio 预览前，不渲染最终视频。

## 4. 架构决策

### 4.1 Template 边界

只有作者文档或其语义无法继续兼容时，才创建新 Template。Composition、动画、布局策略、色彩系统或转场不同，本身不足以成为新 Template。

判断规则：

```text
Storyboard 契约和语义不变 -> Preset
Storyboard 契约或语义不同 -> Template
只是实现代码可以复用       -> Shared code
```

### 4.2 内置 Registry

可执行 Registry 显式定义并编译进 CLI：

```ts
const templates = {
  "rotating-flow": rotatingFlowAdapter,
  "center-line": centerLineAdapter,
  "chat-bubbles": chatBubblesAdapter,
};
```

Manifest 只提供元数据和路径。仅仅发现一个目录，不代表它成为可执行 Template。

### 4.3 Template Context

`loadTemplateContext()` 负责公共查找流程：

```text
查找项目根目录
-> 解析现有配置
-> 选择内置 Adapter
-> 解析 runtime 或 local Template 根目录
-> 读取并校验 Manifest
-> 在支持时解析选中的 Preset
```

对于 runtime 项目，由精确的 Template ID 选择包内 runtime 目录。对于 local/eject 项目，`templatePath` 仍然具有最高优先级，但配置和 Manifest 的 Template ID 都必须是 `rotating-flow`；不识别 `comedy-text`。

### 4.4 最小 Adapter

第一版 Adapter 只包含不同 Template 确实存在差异的命令行为：

```ts
interface TemplateAdapter {
  id: string;
  createInitialFiles(context: TemplateContext): Record<string, unknown>;
  resolve(context: TemplateContext): ResolveResult;
  validate(context: TemplateContext, options?: { requireResolved?: boolean }): ValidationIssue[];

  syncProjectMd?(context: TemplateContext): SyncResult;
  renderLayoutPreview?(context: TemplateContext): LayoutResult;
}
```

不增加 `getRenderProps()`：Studio 和 Render 直接传入 resolve 后的 `project.json`。解析和模板专属校验保留在 Adapter 内部。

### 4.5 最小 Manifest

每个 runtime Template 都包含 `template.json`：

```json
{
  "schemaVersion": "yumoframe.template.v1",
  "id": "rotating-flow",
  "name": "Rotating Flow",
  "description": "旋转动效文字模板。",
  "entry": "src/index.tsx",
  "compositionId": "ComedyTextVideo",
  "authoringGuide": "authoring.md",
  "schemas": {
    "storyboard": "schemas/storyboard.schema.json",
    "project": "schemas/project.schema.json"
  },
  "defaults": {
    "storyboard": "defaults/storyboard.json"
  },
  "presets": {
    "default": "presets/default.json"
  }
}
```

所有引用文件都必须存在，并且必须位于 Template 根目录内。`entry` 和 `compositionId` 以 Manifest 为准；当前配置中的 `render.composition` 继续作为旧项目兼容覆盖项。

### 4.6 配置兼容

保留现有配置中的以下内容：

- `version` 和 `runtimeVersion`
- `templateSource` 和 `templatePath`
- 所有项目文件路径配置
- 渲染尺寸、FPS 和旧 Composition 覆盖项
- ASR、TTS 和强制对齐 processor

只有在实现首个真实 Preset 使用者时，才增加 `preset?: string`。

### 4.7 Preset 解析

Preset 的覆盖顺序固定为：

```text
Template 默认值 < 选中的 Preset < Storyboard 允许覆盖的视觉字段
```

`resolve` 将完整的最终视觉配置写入 `project.json`。Studio 和 Render 不再重新读取 Preset 文件。

### 4.8 命令能力边界

所有 Template 共用的命令：

- `init`
- `validate`
- `resolve`
- `studio`
- `render`
- `eject`
- `inspect --json`
- `templates [--json]`

框架级媒体命令继续共用：

- `transcribe`
- `synthesize`
- `sync transcript`
- processor 能力检查

现有的 `rotating-flow` 专属作者界面继续作为 Adapter 可选能力：

- `sync project`
- `import`
- `layout`
- `project.md`
- `lines.json`

其他 Template 调用这些命令时，应返回明确的“不支持该能力”错误，而不是模仿 `scenes[].lines`。

## 5. 实施路线图

每个阶段结束后，仓库都必须保持可构建状态。当前阶段验收通过前，不开始下一阶段。

### 阶段 0：基线与行为锁定

状态：已完成

- [x] 在不改变行为的情况下运行当前 CLI 测试和类型检查。
- [x] 记录所有 `comedy-text`、`scenes`、`timeline`、Composition、Skill 和 runtime 路径耦合点。
- [x] 补充 local 路径优先级的最小刻画测试；现有测试已经覆盖 sync、layout 和 project Markdown 行为。
- [x] 确认现有 `.github/workflows/publish.yml` 修改未被触碰。

耦合清单：

- CLI 分发与配置：`src/cli.ts`、`src/types.ts`、`src/json.ts`、`src/runtime.ts`、`src/commands/init.ts`、`src/commands/doctor.ts`。
- 模板作者数据与解析：`src/comedy-text.ts`、`src/commands/resolve.ts`、`src/commands/validate.ts`、`src/commands/sync.ts`、`src/commands/import.ts`、`src/project-md.ts`、`src/commands/layout.ts`。
- 渲染绑定：`src/commands/dev.ts`、`src/commands/render.ts`、`runtime/templates/comedy-text/src/Root.tsx`，以及其中的 Composition、自动布局、镜头、时间和 stub project 模块。
- 指令与打包界面：`runtime/skills/yumoframe-comedy-text/`、全局 runtime Schema、README、架构/开发文档，以及打包和渲染 smoke 测试。

验收条件：

- 当前测试和类型检查通过，或者已有失败已被记录。
- 重构开始前，现有行为边界已有测试保护。

验证命令：

```bash
mise exec -- pnpm test
mise exec -- pnpm typecheck
git diff --check
```

### 阶段 1：最小 Registry、Manifest 和 Template Context

状态：已完成

- [x] 增加 `src/templates/types.ts` 和 `src/templates/registry.ts`。
- [x] 增加 `loadTemplateContext()` 和精确的显式注册项查找。
- [x] 在尚未移动当前 Template 的情况下，为其增加最小 Manifest。
- [x] 让 `templates` 读取内置 Registry，并支持 JSON 输出。
- [x] 校验 Manifest ID、入口、Composition、Guide、Schema 和默认文件。
- [x] 继续禁止加载任意 Template 代码。

验收条件：

- Registry 引入时当前模板行为保持不变，阶段 2 再执行 ID 替换。
- 未知 Template ID 和无效 Manifest 会给出清晰错误。
- Registry 不进行 runtime 目录扫描或动态 import。

验证命令：

```bash
mise exec -- pnpm build:cli
mise exec -- pnpm test
```

### 阶段 2：将 `comedy-text` 迁移为 `rotating-flow`

状态：已完成

- [x] 将模板专属 CLI 逻辑和类型移到 `runtime/templates/rotating-flow/src/adapter/`，并独立构建到 `adapter-dist/`。
- [x] 将其 Schema、默认文件和作者指南移到对应 runtime Template 内。
- [x] 将包内 runtime 目录重命名为 `runtime/templates/rotating-flow/`。
- [x] 保留现有 `ComedyTextVideo` Composition ID，避免无关的渲染入口改名。
- [x] 新项目写入 `template: "rotating-flow"`。
- [x] Registry、Schema 和校验仅接受 `rotating-flow`，明确拒绝旧 ID `comedy-text`。
- [x] local/eject 项目继续尊重显式 `templatePath`，但必须包含 ID 匹配的 Manifest。
- [x] 将最终 rotating-flow 坐标和镜头路径写入 resolve 后的 `project.json`。
- [x] Studio 和 Render 直接使用这些解析结果，不再进行第二次布局计算。

验收条件：

- 新项目使用 `rotating-flow`。
- 旧 `comedy-text` 配置会返回清晰的不支持错误，不提供别名或隐式迁移。
- 现有 ASR/TTS、原始音轨、project Markdown、sync 和 layout 行为不回退。

验证命令：

```bash
mise exec -- pnpm test
mise exec -- pnpm typecheck
mise exec -- pnpm pack --dry-run
```

### 阶段 3：通过 Adapter 分发公共命令

状态：已完成

- [x] 通过当前 Adapter 分发 `init`、`validate` 和 `resolve`。
- [x] 通过 Template Context 和 Manifest 路径分发 `studio`、`render` 和 `eject`。
- [x] 增加 `yumoframe inspect --json`。
- [x] 将 `sync project`、`import` 和 `layout` 放到 rotating-flow 可选方法之后。
- [x] 保留 `sync transcript`、`transcribe`、`synthesize` 和 processor 的框架级能力。
- [x] 从公共命令模块移除模板字段解析。

验收条件：

- 公共命令模块不导入 rotating-flow Storyboard/Project 类型。
- 调用未支持的可选命令时，只返回一条清晰错误。
- `inspect --json` 返回项目、规范化后的 Template、Manifest、Guide 和 Schema 内容，而不是 npm 包内部绝对路径。

验证命令：

```bash
mise exec -- pnpm test
mise exec -- pnpm typecheck
```

### 阶段 4：一个通用的 `yumoframe` Skill

状态：已完成

- [x] 将包内 Skill 重命名为 `runtime/skills/yumoframe/`。
- [x] `SKILL.md` 只保留框架级工作流。
- [x] Skill 在创作前调用 `inspect --json`。
- [x] 将 rotating-flow 规则和示例移入该 Template 的 Guide。
- [x] 保留 transcript 审核、speech plan 审核、原始音轨和 Studio 确认门禁。
- [x] 将安装文档更新为 `npx skills add ... --skill yumoframe`。
- [x] 不增加 Agent 专属 CLI 安装器。

验收条件：

- 切换 Template 不需要安装另一个 Skill。
- Skill 不包含 Template 字段定义、绝对 runtime 路径或最终布局坐标。

验证命令：

```bash
mise exec -- pnpm test
mise exec -- pnpm pack --dry-run
```

### 阶段 5：增加 `center-line` 和首批真实 Preset

状态：已完成

- [x] 增加 `lines[]` Storyboard 和独立 Project 契约。
- [x] 媒体/TTS 项目的行时间来自 `transcript.json`。
- [x] 文本项目接受显式行时间。
- [x] 增加最小的中央逐行 Remotion Composition。
- [x] 增加默认 Preset `minimal-dark`。
- [x] 在配置中增加 `preset?: string`，并支持 `init --preset`。
- [x] 将完整视觉配置解析到 `project.json`。
- [x] 增加 `echo` Preset，不改变 Storyboard 结构或公共命令。

验收条件：

- `center-line` 使用 `lines[]`，不包含 `scenes[]`。
- 两个 Preset 可以从同一份 Storyboard 解析。
- 增加 `center-line` 时，不向公共命令文件增加 Template 分支。

验证命令：

```bash
mise exec -- pnpm test
mise exec -- pnpm typecheck
mise exec -- pnpm build
```

### 阶段 6：增加 `chat-bubbles`

状态：已完成

- [x] 增加 `participants[] + messages[]` 作者数据契约和 Project 契约。
- [x] 支持左右参与者和可选头像。
- [x] v1 只支持文字消息。
- [x] 解析出现时间、停留/停顿、气泡布局和滚动状态。
- [x] 媒体/TTS 项目使用 `transcript.json` 对齐消息文字。
- [x] 文本项目使用显式持续时间或 Template 中有文档说明的默认值。
- [x] 图片、语音和文件消息继续被拒绝，并返回清晰校验错误。

验收条件：

- `chat-bubbles` 不依赖 `scenes[]`。
- 参与者引用、顺序、时间和文字消息类型都经过校验。
- 增加该 Template 不修改公共命令行为。

验证命令：

```bash
mise exec -- pnpm test
mise exec -- pnpm typecheck
mise exec -- pnpm build
```

### 阶段 7：提取已被验证的共享代码

状态：已完成

- [x] 比较三个可运行 Template 中的真实重复代码。
- [x] 只提取至少被两个 Template 使用的代码。
- [x] 优先提取纯时间/文本函数，再考虑 React 组件抽象。
- [x] Storyboard 和 Project 契约继续归各 Template 所有。
- [x] 不创建没有使用者的 backgrounds、motions、themes 或组件目录。

只有在出现重复时才考虑以下候选：

- 秒与帧的换算
- 音轨渲染
- 高亮文字渲染
- 背景基础组件
- 小型转场函数

验收条件：

- 共享代码至少有两个真实调用方。
- 移动共享代码不改变任何公开数据契约。

验证命令：

```bash
mise exec -- pnpm test
mise exec -- pnpm typecheck
```

### 阶段 8：文档和安装包验收

状态：已完成

- [x] 对齐 `README.md` 和 `README.en.md`。
- [x] 更新 `docs/architecture.md` 和 `docs/development.md`。
- [x] 让根目录构建和类型检查脚本覆盖三个 runtime Template。
- [x] 验证 tarball 包含所有 Manifest、Schema、Guide 和 Preset。
- [x] 将 tarball 安装到临时 prefix。
- [x] 使用安装后的 CLI 为三个 Template 运行 `init -> validate -> resolve`。
- [x] 为每个 Template 运行最小 runtime 渲染 smoke。
- [x] 至少让一个新 Template 完成 eject 后的渲染 smoke。
- [x] 重新检查旧 `comedy-text` ID 在 runtime 和 local 配置中都被明确拒绝。
- [x] 保留用户视频必须先经 Studio 确认才能渲染的规则。
- [ ] 普通 CI（push/PR 上跑 build、test、typecheck、pack）；当前仅有 tag 触发的 `publish.yml`。

验收条件：

- 不能把源码树测试通过等同于安装包可用。
- 包内 runtime 和 eject 后的 runtime 都能运行。
- 面向用户的中英文文档描述一致。

验证命令：

```bash
mise exec -- pnpm build
mise exec -- pnpm typecheck
mise exec -- pnpm test
mise exec -- pnpm pack --dry-run
git diff --check
```

## 6. 交付/提交顺序

每一项都是可独立审查的边界。Git 暂存和提交仍需用户明确授权。

1. Registry、Template Context 和当前模板 Manifest。
2. `comedy-text` 到 `rotating-flow` 的直接替换，不保留兼容别名。
3. 公共命令分发、旧可选能力和 `inspect --json`。
4. 通用 `yumoframe` Skill。
5. `center-line` 和 `minimal-dark`。
6. `echo` Preset。
7. `chat-bubbles`。
8. 已验证的共享代码提取、文档和安装包验收（普通 CI 仍待补）。

## 7. 完成标准

- [x] 三个 Template 拥有独立的 Storyboard 和 Project 契约。
- [x] Preset 不改变所属 Template 的 Storyboard 契约。
- [x] 公共 CLI 命令不解析 Template 专属字段。
- [x] 旧 runtime 和 local `comedy-text` 配置都返回清晰的不支持错误。
- [x] `sync project`、`import` 和 `layout` 有明确的能力边界。
- [x] 一个 `yumoframe` Skill 可以动态支持三个 Template。
- [x] 媒体时间来自 transcript 数据，原始提取音轨继续用于播放。
- [x] Studio 和 Render 使用相同的 resolve 后 Project 数据。
- [x] 增加新 Template 不需要修改公共命令工作流。
- [x] 根目录构建和类型检查覆盖每个包内 Template。
- [x] 安装包和 eject smoke 测试通过。
- [x] README 中英文版本以及架构/开发文档保持一致。

## 8. 进度记录

每个阶段完成后更新本节，不重写已经完成的历史。

- 2026-07-17：根据已评审的 1,648 行提案和当前仓库行为创建路线图。
- 2026-07-17：阶段 0 基线通过，包含 49 个 Node 测试以及 CLI/模板类型检查；增加回归断言，确保 local `templatePath` 具有最高优先级。
- 2026-07-17：阶段 1 增加显式内置 Registry、经过校验的 Manifest/Template Context、`templates --json` 和路径穿越拦截。完整测试增加到 50 个并全部通过；typecheck、pack dry-run 和 diff check 通过。
- 2026-07-18：根据最终决定，阶段 2 采用 `rotating-flow` 唯一 ID，不保留 `comedy-text` 别名、旧 Manifest 回退或渲染期自动布局兜底。
- 2026-07-18：阶段 2 完成。模板源码和 runtime 已迁移到 `rotating-flow`；resolve 写入唯一布局坐标，Studio/Render 直接消费解析结果。50 个测试、CLI/runtime 生产构建、pack dry-run 和 diff check 全部通过。
- 2026-07-18：阶段 3 完成。公共命令通过最小 Adapter 分发，Template Context/Manifest 驱动预览、渲染和 eject，新增 `inspect --json`；转写同步继续留在框架层。50 个测试、typecheck、pack dry-run 和 diff check 全部通过。
- 2026-07-18：阶段 4 完成。通用 `yumoframe` Skill 先读取 `inspect --json`，rotating-flow 规则和示例归入 Template Guide，安装文档已同步。51 个测试、typecheck、pack dry-run、手工 Skill 元数据校验和独立前向测试通过；官方 `quick_validate.py` 因本机缺少 PyYAML 未能启动。
- 2026-07-18：阶段 5 完成。新增独立 `center-line` 数据契约与 Remotion runtime，支持 `minimal-dark`、`echo` 和 Storyboard 视觉覆盖；文本项目强制显式时间，媒体项目从 transcript 对齐。55 个测试、typecheck、完整 build、pack dry-run 和 diff check 全部通过。
- 2026-07-18：阶段 6 完成。新增 `participants[] + messages[]` 的 `chat-bubbles` 契约与 runtime，支持左右参与者、可选头像、文字消息、停顿、transcript 对齐和解析后的滚动状态；非文字消息明确拒绝。58 个测试、三个 runtime 的 typecheck、完整 build、pack dry-run 和 diff check 全部通过；打包清单已排除模板 `node_modules`。
- 2026-07-18：阶段 7 完成。三个 runtime 保持可独立 eject，只提取 `center-line` 与 `chat-bubbles` 的通用 JSON 对象信任边界；已有 transcript 字符时间对齐继续由三个模板复用。没有新增 speculative 组件目录或跨模板 Storyboard/Project 类型，58 个测试与 typecheck 通过。
- 2026-07-18：阶段 8 完成。中英文 README 与架构/开发文档已对齐；真实 tarball 安装到临时目录后，三个 Template 的 `init -> resolve -> validate` 与低分辨率 runtime smoke 全部通过，`chat-bubbles` eject 后渲染通过，旧 `comedy-text` runtime/local 配置均被明确拒绝。最终 58 个测试、typecheck、完整 build、pack dry-run 和 diff check 全部通过。普通 CI（非 publish 的 push/PR 工作流）尚未添加。
- 2026-07-19：纠正阶段 8 记录：仓库仅有 tag 触发的 `publish.yml`，没有独立的普通 CI workflow。
- 2026-07-18：按模板所有权继续收口。三个内置 Adapter 源码迁入各自的 `packages/templates/<id>/src/adapter/`，独立构建为随包发布的 `adapter-dist/index.js`；`packages/cli/src/templates/` 只保留 Registry、公共协议与 JSON 信任边界。`docs/development.md` 已完整翻译为中文。
- 2026-07-18：仓库改为轻量 pnpm workspace 开发布局。CLI、模板、Python Processor、Skill、Schema 和测试分别归入 `packages/cli`、`packages/templates`、`processors`、`skills`、`schemas`、`tests`；仍只发布一个 `yumoframe` npm 包。58 个测试、typecheck、完整 build、pack dry-run 和真实 tarball 安装 smoke 均通过。
