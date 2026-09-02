## Why

Web 聊天已经能够启动数字员工主 Agent，并加载其技能、工具、MCP 和记忆，但模型没有稳定的委派入口来调用模板授权的专家 Agent 或普通 subagent。专家运行时已经存在，却无法从真实聊天任务中发挥作用，导致“数字员工可以配置专家”与“数字员工能够自主协作”之间存在断层。

## What Changes

- 增加模型可调用的专家委派工具，将请求路由到 `DigitalEmployeeAgent.delegateToExpert()`。
- 增加或恢复受策略控制的普通 subagent 模型工具，支持同步结果与后台子会话。
- 让专家子 Agent 继承正确的员工、专家和父 Agent 权限，并加载其声明的 skills、tools、MCP、memory 与 instructions。
- 在 Web preset 中按当前 Agent scope 注册可用的委派工具，避免跨会话注册冲突。
- 对专家和 subagent 增加越权、深度、并发、超时、不可用 provider 等错误处理和审计事件。
- 增加 Host、Core、工具注册和 Web E2E 测试，验证聊天中模型能够实际委派并收到结果。

## Capabilities

### New Capabilities

- `digital-employee-agent-delegation`: 数字员工主 Agent 对专家 Agent 和普通 subagent 的模型侧委派、权限和生命周期行为。
- `digital-employee-delegation-chat`: Web 聊天中的委派工具展示、执行、结果回传和子会话可观测行为。

### Modified Capabilities

- `digital-employee-capabilities`: 专家与 subagent 的委派必须遵守员工、专家和父 Agent 的能力交集，并记录可归因的委派行为。

## Impact

- 影响 `packages/core/digital-employee-agent`、`packages/subagent/tool-subagent`、`packages/bundle/web-app`、Host 数字员工管理和 Web UI/输入工具链。
- 可能新增模型工具 schema、Session 事件、Remote 查询或子会话投影字段。
- 需要更新数字员工模板配置的 delegation policy 校验、权限交集计算和相关中英文文档。
