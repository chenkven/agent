---
description: "运行 Agent Base 导师演示，核验权限、模型、能力与委派。"
kind: "tutorial"
---

# 导师演示

[English](mentor-demo.md) | 中文

## 前置条件

完成[源码安装](../../../README.zh.md#run-from-source)，使用可丢弃的项目目录，准备有可用额度的有效模型 API Key，并保持 Host 进程运行。角色通过父模型委派，因此所选模型需要支持工具调用。

## 演示步骤

1. 在仓库中启动 `pnpm run agent-base web`，打开打印的完整网址。在**能力中心 → 模型**配置供应商凭据，展示供应商和模型目录，然后在聊天中发送简单消息，确认真实回答。
2. 打开**能力中心 → 权限**，选择同一会话，应用**只读**。展示沙箱和审批说明，确认聊天中的权限选项同步。使用可丢弃的工作区展示写入被阻止或申请审批，不要用重要文件做演示。
3. 打开 **Skill**，查看来源与调用开关。演示编辑时使用 `.agents/skills` 或 `.dsh/skills` 内的项目 Skill；页面中的内置 Skill 只读。
4. 打开 **MCP**，添加自己控制的服务器连接，展示新连接默认停用。启用并确认运行时激活，再让模型调用工具。打开 **Prompt**，预览一个预设组合，展示其默认设置应用于新会话。
5. 打开**多 Agent**，添加研究员示例，展示提示词、模型继承以及 `read`、`glob`、`grep` 允许列表。选择会话，提交：“使用 delegate_researcher 读取 README.md，用证据总结平台能力，再汇总其结果。”观察主代理调用委派工具，刷新子代理记录，打开子会话。子代理使用独立上下文，继承父会话沙箱范围，不能申请扩大权限。
6. 重启 Host，再打开打印的完整网址，确认角色仍存在。演示编辑、停用、重新启用和删除角色；删除后已有子会话历史仍然可查看。

## 复用方式

[Profile 管理器](../../../packages/boot/plugin-manager/README.zh.md)保存可编辑角色和 MCP 连接。新模型系列扩展适配器及共用的[模型编辑器](../../../packages/client/ui-settings-models/README.zh.md)，新委派后端实现已有[子代理约定](../../subsystems/subagent.zh.md)。产品页面使用有类型的 Remote 和插槽扩展，这些扩展无需修改核心循环。

## 验证证据

无真实密钥的[角色集成测试](../../../apps/cli/tests/profiles/web/tests/capability-agents.expected.e2e.ts)启动正式 Web profile，保存并重启恢复角色，用确定性模型适配器运行真实的进程内子代理，核验模型、persona、工具输入和继承的沙箱、审批策略，再删除委派工具。[MCP 集成测试](../../../apps/cli/tests/profiles/web/tests/capability-mcp.expected.e2e.ts)覆盖 MCP 管理和项目 Skill 操作。这些测试确认运行时接线，不验证付费供应商凭据或外网质量。

<a id="remote-access"></a>
## 远程访问

本地 Web 启动需要完整的身份验证网址。花生壳或其他隧道的端口映射不会自动提供访问者凭据隔离，也不会开放受限的远程设置。本机 `.artifacts/` 中的演示网关不属于仓库交付。若需各访问者使用自己的 API Key，应部署经过认证的网关，为每人创建独立运行时和凭据存储，从另一设备测试，并保持 Host 和映射进程运行。生产身份认证、额度控制和租户隔离需要单独部署工作。

## 常见问题

- `MISSING_CREDENTIAL`：为聊天或角色中实际选择的供应商路由配置密钥，其他路由的密钥不能替代。
- 没有子代理记录：提交只表示父会话收件箱接受了请求。检查角色是否启用且已就绪、模型是否调用 `delegate_<name>`，以及父模型调用是否失败。
- `restart-required`：重启 Host，该 profile 不会实时应用配置。
- `settings are unavailable in this browser`：浏览器正在使用受限的远程设置。使用本地设置编辑器或网关提供的专用凭据流程。
