---
description: "agent base 浏览器品牌包，填充侧栏和会话首屏的品牌位置。"
kind: "package-reference"
---

# 浏览器品牌包

[English](README.md) | 中文

## 概述

在 Web 侧栏和空白会话首页展示 agent base 标志与名称。本地和官方 Web 构建都显示这个身份。

## 目录

- [使用本包](#use-this-package)
- [模型体验](#model-experience)
- [已知限制与延期工作](#known-limitations-and-deferred-work)
- [开发备注](#dev-note)

<a id="use-this-package"></a>
## 使用本包

本包为侧栏标志、侧栏名称及空白会话首屏的标志位置提供 agent base 品牌。它在本地和 official 构建模式下都会生效。包标识 `ui-brand-official` 暂时保留，以兼容现有 Web 插件清单；实际显示的产品身份为 agent base。

标志是节点连接图形 SVG，会接受宿主传入的尺寸和 CSS 类；名称使用文字呈现。侧栏的两个位置一同注册，首屏位置独立注册，因此两个界面可以分别加载。Host 入口为空的 Loader 位置。

浏览器标题由构建时的 `DSH_CLIENT_TITLE` 单独设置，Web 图标位于 `apps/web/public`。本包不会改变模型请求或供应商名称。

<a id="dev-note"></a>
### 开发备注

插件只负责浏览器品牌扩展。修改产品名称时，保持两种语言的字典与侧栏预期同步。

<a id="model-experience"></a>
## 模型体验

无。该包只在浏览器运行，不提供面向模型的工具或提示词。

#### KV Cache 影响

无；浏览器品牌扩展不组装或发送模型请求。

## 已知限制与延期工作

<a id="known-limitations-and-deferred-work"></a>

- 为兼容现有插件清单，包标识暂时保留 `ui-brand-official`。浏览器标题和图标需分别配置。
