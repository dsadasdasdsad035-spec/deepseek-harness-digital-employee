# Agent Note: 数字员工能力以扩展 bundle 交付

Status: implemented

[English](2026-09-02-digital-employee-suite-bundle.md) | 中文

## Problem

数字员工管理和浏览器工作区分布在已有 Host 与 Client 包中，而市场和 API remote 的所有权已经属于 Web bundle。可单独安装的数字员工包必须复用这些所有者，避免重复注册远程命名空间，也不能把配置保存到 bundle 作者的用户目录。

## Decision

仓库交付 `@deepseek-ai/dsh-digital-employee-suite`，作为 `@deepseek-ai/dsh-base` 和 `@deepseek-ai/dsh-web-app` 之上的可选扩展。它的 patch 负责数字员工定义、持久化、Agent 集成、管理和浏览器工作区行；Web bundle 继续负责 `api-remotes`、Skill/Tool/MCP 市场行以及市场设置 UI。

suite 自己持有的所有持久化路径都使用 `dshHomePath(...)` 表达：员工记录使用 `digital-employees/employees.json`，Template configuration 草稿与发布记录使用 `digital-employees/configuration-studio.json`。包中不携带源机器数据、绝对路径或已解析凭据值。

## Alternatives considered

- **把 Web bundle 的市场和 remote 行复制到 suite：** 不采用，因为同时加载两个包会重复注册命名空间，包括之前出现过的 `skillMarket/install` 冲突。
- **保持管理 Host 原有的配置台默认路径：** 不采用，因为该默认路径指向开发机专用的旧用户目录，会破坏目标工程数据隔离。
- **创建单体数字员工运行时包：** 不采用，因为现有 capability seam 已经拥有生命周期、生成 remote 和浏览器贡献；复制这些能力会产生竞争注册表并增加升级风险。

## Consequences

使用方必须把 suite 与 base、Web bundle 一起安装，市场清单继续通过 Web 所拥有的组合提供。卸载或升级 suite 不会删除目标 `$DSH_HOME` 数据。组合测试固定所有权划分，以及 Skill、Tool、MCP、员工和 Template configuration 的目标本地路径。
