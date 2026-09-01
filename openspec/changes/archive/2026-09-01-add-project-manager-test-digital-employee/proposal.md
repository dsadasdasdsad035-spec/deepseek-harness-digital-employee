## Why

现有数字员工能力需要一个完整且确定性的参考实例，用于验证模板解析、记忆加载、专属 skill、模型工具和 MCP 客户端配置如何共同组成一次项目经理会话。

## What Changes

- 新增一个名为 `project-manager-test` 的测试数字人定义，作为项目经理角色的可运行示例。
- 在定义中包含 `AGENTS.md`、项目管理 skills、受控 mock tools、本地 mock MCP 客户端配置和持久 memory 种子。
- 将示例接入现有数字员工模板与测试基础设施，证明实例启动后只能使用其明确声明的能力，并能读取记忆与 MCP 项目数据。
- 提供确定性测试，覆盖模板发现、聊天启动、项目计划与风险汇报工作流，以及记忆写回。

## Capabilities

### New Capabilities

- `project-manager-test-digital-employee`: 一个完整、离线可验证的项目经理数字人员工定义，包含专属 skills、tools、MCP、memory 和角色说明。

### Modified Capabilities

- None.

## Impact

- 在数字员工示例或测试夹具中新增项目经理定义及其 `AGENTS.md`、skills、tools、MCP 与 memory 文件。
- 更新数字员工模板测试、Host 组合测试和必要的 Web/聊天测试夹具。
- 使用本地 mock 提供项目数据和工具结果；不增加外部网络依赖、真实凭据、模型协议或会话格式变更。
