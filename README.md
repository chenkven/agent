# agent base

English | [中文](README.zh.md)

agent base is a reusable agent workspace built from the open-source [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness) codebase. This repository is a separate project at [chenkven/agent](https://github.com/chenkven/agent). The package names and `dsh` command still reflect the upstream implementation.

## Status

The project is being adapted into a reusable agent foundation. Model provider configuration and plugin composition are available in the underlying codebase; access control, a unified capability center, and multi-agent product flows still need project-specific work. The interface and APIs may change.

## Run from source

Install Node.js and pnpm, then run:

```sh
git clone https://github.com/chenkven/agent.git
cd agent
pnpm install
pnpm run build
pnpm dsh web
```

The local Web UI starts at `http://127.0.0.1:3080` by default. See the [Web UI guide](docs/user/guide/index.md) for details.

## Upstream and license

The implementation is based on DeepSeek Harness by DeepSeek AI. Upstream documentation is available at [deepseek-harness.github.io](https://deepseek-harness.github.io/deepseek-harness/). The project remains under the [MIT License](LICENSE); dependency notices are in [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md).