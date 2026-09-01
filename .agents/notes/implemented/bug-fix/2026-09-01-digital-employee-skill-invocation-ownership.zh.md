# Agent Note: 数字员工 Skill 调用所有权

Status: implemented

[English](2026-09-01-digital-employee-skill-invocation-ownership.md) | 中文

## Problem

数字员工组合分别限制 Skill 和 Tool，但模型可见的 Skill 目录依赖名为 `skill` 的 Tool。业务 Tool 白名单省略该基础设施 Tool 时，已授权 Skill 定义仍然存在，其目录和加载器却同时被隐藏。模板验证又只检查 Skill 摘要，因此可能发布无法加载正文的引用。

## Decision

拥有 Skill 的数字员工会在继承的业务 Tool 限制生效后，把 `dsh-tool-skill` 挂载到员工 Agent 的精确作用域。Tool 限制继续过滤继承的业务能力，员工自有加载器则根据 Tool 注册表既有的本层规则保持可见。Skill 限制仍是目录条目和已加载定义的权威来源。

模板配置不会把 `skill` 写入持久化 Tool 授权或市场选择。验证会通过所选 preset 的 standing 作用域解析每个已授权 Skill 正文；已列出但没有可加载定义的 Skill 会产生 `unloadable-skill` 诊断。

组装后的项目经理 fixture 会调用真实加载器，并记录其返回指令与 `skill/selected` 归属。仅列出注册表内容不能作为模型可见 Skill 行为的验收证据。

## Alternatives considered

**把 `skill` 加入每个员工的 Tool 授权。** 该方案被拒绝，因为管理员授权的是业务 Tool，而不是实现独立 Skill 授权所需的基础设施。

**在 ToolRegistry 限制中全局豁免该名称。** 该方案被拒绝，因为注册表无法区分可信加载器与同名的无关作用域 Tool，而且该例外会影响所有 Agent 类型。

**依赖 preset 挂载加载器。** 该方案被拒绝，因为 preset 贡献由员工 Agent 继承，仍会受到其后续 Tool 限制。

## Consequences

现有模板和员工记录不需要迁移。拥有 Skill 的员工会增加一个模型可见基础设施 schema；没有 Skill 的员工不会挂载它。验证会加载已授权 Skill 定义，增加验证工作量，同时能在发布前拒绝原本只会在运行时出现的失败。
