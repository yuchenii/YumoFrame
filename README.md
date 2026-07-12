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

文本和音视频共用同一条创作链路，差别主要是要不要转写：

| 输入 | 流程概要 | 建议确认的节点 |
|------|----------|----------------|
| 文本 | `init` → 写 `lines.json` / `storyboard.json`（含时间）→ `resolve` → `validate` → `studio` → `render` | `project.md`、studio 预览；同意后再 render |
| 音视频 | `init` → 放媒体并 `transcribe` → 校对 `transcript.md` → `sync` → 写 lines/storyboard（**不要编时钟**）→ `resolve --align` → `validate` → `studio` → `render` | 转写校对、`project.md`、studio 预览；同意后再 render |

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

## 文档

- [开发指南](docs/development.md) — 环境、编译、本地 Skill、测试、打包内容
- [架构说明](docs/architecture.md) — runtime 与纯数据项目
