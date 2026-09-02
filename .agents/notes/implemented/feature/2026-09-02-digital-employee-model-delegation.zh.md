# Agent Note：数字员工模型委派

Status: implemented

[English](2026-09-02-digital-employee-model-delegation.md) | 中文

## 问题

Web 聊天可以创建数字员工 Agent，Core 服务也可以委派到具名专家，但模型没有把这两个入口连接起来的作用域工具。

## 决策

`DigitalEmployeeAgent.compose()` 仅在解析后的员工拥有专家时，在当前 Agent 的工具注册表中注册 `delegate_to_expert`。工具捕获解析后的员工组合，使用当前工具调用者作为父 Agent，选择 Host 注册的 `spawn` provider（或第一个可用 provider），再调用现有的 `delegateToExpert()` 服务。专家解析、权限交集、子 Agent 组合、MCP 挂载、Session 事件和生命周期清理仍由 Core 服务负责。

即使当前没有可用 provider，工具仍会注册。执行时返回现有 provider 诊断，而不是静默地从有效员工组合中移除模型可见能力。

## Alternatives considered

拒绝将专家操作注册在 Host 组合中，因为那会把一个共享工具暴露在员工 Agent 作用域之外，也无法选择当前员工已授权的专家目录。拒绝替换现有 subagent runtime，因为这会重复子会话生命周期、权限和继续执行逻辑。

## 后果

专家委派现在位于 Agent 作用域内，不能暴露其他员工的专家目录。现有普通 `subagent` 工具仍由 preset 组合独立控制；在 Web 中启用它仍需要组装 preset 决策和端到端覆盖。
