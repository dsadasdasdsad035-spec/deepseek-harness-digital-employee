# `@deepseek-ai/dsh-digital-employee-agent`

[English](README.md) | 中文

把解析后的数字员工组装到未发布 Agent 作用域中的 Consumer。它挂载模板的精确 preset，并在发布 Agent 前注册作用域化身份、个性、实例覆盖与带版本的 `AGENTS.md` 提示词片段。

## 创建任务

`DigitalEmployeeAgent.createTask()` 会先解析活跃员工，再请求 Agent 注册表创建根 Session。因此解析失败不会遗留 Session。即使调用方元数据指定了另一个 preset，所创建的 Agent 仍使用解析后模板的 preset；调用方会持有返回的句柄，直到任务被接纳或放弃。调用方提供完整模型选择时，设置过程会把它安装到提示词变量和请求路由中，同时保留 `maxTokens` 等可选循环设置。

未发布 Agent 的设置过程记录 `digital-employee/identity`，其中包含员工实例、模板 ID 与版本、确定性的组合 ID、显示名称和个性；随后记录带指令修订号的 `digital-employee/instructions`。这两个事件默认必须被读取，因为它们既确立持久归属，也用于重建模型可见的员工输入。

当 `createTask()` 收到记忆查询时，它会在创建 Session 前解析一份有界、归员工所有的投影。设置过程记录 `digital-employee/memory-projection`，包含每条可见记忆的 ID、作用域、渲染内容与来源，再从同一个事件 payload 渲染提示词片段。

具名专家使用现有 subagent 运行时。委派会记录请求、拒绝、子级身份与结果事件；可继续的专家仍可通过其父任务寻址。专家的有效权限是专家声明、员工授权与父 Agent 权限三者的交集，而深度、并发和超时限制只能收紧。

当员工拥有已授权专家且运行时存在 subagent provider 时，其 Agent 作用域会暴露 `delegate_to_expert`。模型必须提供精确的专家 ID 和非空任务；工具选择可用 provider，并返回一次性结果或可继续的子会话身份。provider 缺失会返回明确的运行时诊断，工具不会授予解析后员工权限之外的能力。

MCP server 与 skill 引用从员工的显式权限中解析。缺少引用时任务创建失败，不会暴露环境中的注册项。

位于 `examples/headless-agent/tests/fixtures/core/digital-employee-agent/` 的无密钥 Loader fixture 注册一个受信任模板，创建并激活实例，再通过现有 agent loop 运行一项根任务。

## 模型体验

### 员工请求上下文

#### 模型看到的内容

每次请求都能看到来自 `digital-employee/*` 事件的已记录员工身份、模板与实例个性、带版本的指令、选定的记忆投影及已完成的专家结果。工具 schema 只包含解析后权限中存在的 skill、工具与 MCP server。

#### Token 影响

提示词用量随所选指令文件、简短身份元数据、有界记忆投影与渲染后的专家结果增长。

#### KV Cache 影响

员工身份、个性覆盖、模板版本、指令修订、权限与投影记忆不变时，前缀保持稳定。

## 已知限制与后续工作

- **不提供员工专属调度器**：任务与专家依赖已挂载的 Agent 和 subagent 运行时；本包不提供独立执行引擎。
