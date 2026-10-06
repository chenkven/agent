# agent base

[English](README.md) | 中文

agent base 是基于开源项目 [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness) 改造的可复用 Agent 工作空间。本项目仓库为 [chenkven/agent](https://github.com/chenkven/agent)，与上游项目分开维护。当前代码中的包名和 `dsh` 命令仍沿用上游实现。

## 当前状态

项目正在向可复用 Agent 底座演进。底层已有大模型供应商配置与插件组合能力；权限控制、统一能力中心和多 Agent 产品流程还需要继续实现。界面与 API 可能调整。

## 从源码运行

安装 Node.js 和 pnpm 后执行：

```sh
git clone https://github.com/chenkven/agent.git
cd agent
pnpm install
pnpm run build
pnpm dsh web
```

Web 界面默认在 `http://127.0.0.1:3080` 启动。更多信息参见 [Web UI 指南](docs/user/guide/index.zh.md)。

## 上游与许可

本项目基于 DeepSeek AI 开发的 DeepSeek Harness。上游文档见 [deepseek-harness.github.io](https://deepseek-harness.github.io/deepseek-harness/)。代码沿用 [MIT 许可证](LICENSE)，第三方依赖信息见 [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md)。