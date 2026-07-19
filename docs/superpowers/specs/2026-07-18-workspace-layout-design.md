# YumoFrame Workspace 目录设计

## 目标

保持只发布一个 `yumoframe` npm 包，把开发源码按真实职责拆开，移除含义过宽的 `runtime/`。

## 目录

```text
packages/
  cli/src/             # CLI 源码；构建到 packages/cli/dist/
  templates/*/         # 私有 pnpm workspace，包含 Remotion 与 Adapter
processors/*/          # Python/uv 项目及共享 TTS profile
skills/yumoframe/      # Agent Skill
schemas/               # 随包发布的 JSON Schema
tests/                 # CLI 与打包 smoke
scripts/               # 仓库构建和发布脚本
```

根 `package.json` 继续是唯一发布单元和统一命令入口。模板保持 `private: true`，不引入多包版本管理；Python 项目不伪装成 pnpm package。发布清单直接包含上述目录的运行时文件，不增加 staging 或复制层。

## 验收

- 根目录安装后可统一构建 CLI 和三个模板。
- npm tarball 中包含 CLI、模板、processor、Skill 和 Schema。
- 安装后的 CLI 能完成三个模板的 `init -> resolve -> validate`。
- 用户项目继续保持 data-only。
