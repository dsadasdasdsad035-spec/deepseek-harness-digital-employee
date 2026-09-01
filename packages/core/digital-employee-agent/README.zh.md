# `@deepseek-ai/dsh-digital-employee-agent`

[English](README.md) | 中文

把解析后的数字员工组装到未发布 Agent 作用域中的 Consumer。它挂载模板的精确 preset，并在发布 Agent 前注册作用域化身份、个性、实例覆盖与带版本的 `AGENTS.md` 提示词片段。

## 创建任务

`DigitalEmployeeAgent.createTask()` 会先解析活跃员工，再请求 Agent 注册表创建根 Session。因此解析失败不会遗留 Session。即使调用方元数据指定了另一个 preset，所创建的 Agent 仍使用解析后模板的 preset；调用方会持有返回的句柄，直到任务被接纳或放弃。调用方提供完整模型选择时，设置过程会把它安装到提示词变量和请求路由中，同时保留 `maxTokens` 等可选循环设置。

未发布 Agent 的设置过程记录 `digital-employee/identity`，其中包含员工实例、模板 ID 与版本、确定性的组合 ID、显示名称和个性；随后记录带指令修订号的 `digital-employee/instructions`。这两个事件默认必须被读取，因为它们既确立持久归属，也用于重建模型可见的员工输入。

当 `createTask()` 收到记忆查询时，它会在创建 Session 前解析一份有界、归员工所有的投影。设置过程记录 `digital-employee/memory-projection`，包含每条可见记忆的 ID、作用域、渲染内容与来源，再从同一个事件 payload 渲染提示词片段。

具名专家使用现有 subagent 运行时。委派会记录请求、拒绝、子级身份与结果事件；可继续的专家仍可通过其父任务寻址。专家的有效权限是专家声明、员工授权与父 Agent 权限三者的交集，而深度、并发和超时限制只能收紧。

MCP server 与 skill 引用从员工的显式权限中解析。缺少引用时任务创建失败，不会暴露环境中的注册项。

拥有已授权 Skill 的员工会在自身作用域内持有 `skill` 加载器和目录 Consumer。加载器属于运行时基础设施，而不是模板 Tool 授权，因此业务 Tool 白名单不会隐藏原本已授权的 Skill；Skill 白名单仍决定目录中的每个条目和每次加载。

位于 `examples/headless-agent/tests/fixtures/core/digital-employee-agent/` 的无密钥 Loader fixture 注册一个受信任模板，创建并激活实例，再通过现有 agent loop 运行一项根任务。

## 模型体验

### 员工请求上下文

#### 模型看到的内容

每次请求都能看到来自 `digital-employee/identity` 的员工身份、来自 `digital-employee/instructions` 的带版本指令、来自 `digital-employee/memory-projection` 的选定记忆、已完成的专家结果及已授权 Skill 目录。工具 schema 包含已授权的业务 Tool 与 MCP server；员工拥有 Skill 时还包含作用域化 `skill` 加载器。

#### Token 影响

提示词用量随所选指令文件、简短身份元数据、有界记忆投影与渲染后的专家结果增长。

#### KV Cache 影响

员工身份、个性覆盖、模板版本、指令修订、权限与投影记忆不变时，前缀保持稳定。

## 已知限制与后续工作

- **不提供员工专属调度器**：任务与专家依赖已挂载的 Agent 和 subagent 运行时；本包不提供独立执行引擎。
