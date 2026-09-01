# Agent Note: 模板 Skill 目录可用性

Status: implemented

[English](2026-09-01-template-skill-catalog-availability.md) | 中文

## Problem

模板作者需要一个统一的 Skill 选择器，但安装来源与运行时组合由不同服务提供。若把市场安装视为运行时可用，草稿就可能选择当前 Host 无法组合的 Skill。若把运行时注册表视为完整目录，则会隐藏需要重启的已安装 Skill，并缺少市场元数据。

## Decision

数字员工管理 Gateway 负责客户端安全的合并。它通过 `agentPresets.standingKeyFor()` 解析草稿的 Agent preset，读取 `skills.list({ scope })`，再按稳定 Skill 名称把该作用域运行时目录与可选的 Skill 市场清单合并。Skill 是否存在于所选 preset 作用域是唯一的可用性信号。市场清单提供描述、版本、作者、标签、托管来源和重启元数据。仅存在于作用域运行时的 Skill 保持为可选本地条目。仅存在于市场的 Skill 保持可见但不可用。

模板只持久化 Skill 名称。市场元数据属于展示状态，绝不复制进草稿。若已选名称在两个目录中都不存在，编辑器会将其合成为不可用但可移除的引用。Gateway 不返回安装路径、归档文件名或凭据值。

目录检查复用 preset 服务的 standing single-flight 组合，不创建 Agent、Session、turn、会话或模型请求。草稿验证与发布独立于浏览器状态解析同一个作用域目录。

## Alternatives considered

**把市场安装视为可用。** 拒绝，因为安装发布与运行时激活可能被 Host 组合或重启分隔。

**只列出运行时 Skill。** 拒绝，因为管理员无法看到已安装但未激活的 Skill，也无法获知激活所需操作。

**在模板中持久化市场元数据。** 拒绝，因为复制的元数据会过时，并把不可变模板权限与可变目录展示耦合。

**读取 Host 全局 Skill 注册表。** 拒绝，因为该视图不包含 preset 自有的文件系统 provider 与限制，模板可用性会与员工组合不一致。

## Consequences

首次读取可能挂载 preset 的 standing provider，包括文件系统 watcher；并发读取共享该组合。修改草稿 preset 会重新加载目录，旧响应不能覆盖最新结果；刷新失败时禁止新增选择，同时保留已选名称供移除。
