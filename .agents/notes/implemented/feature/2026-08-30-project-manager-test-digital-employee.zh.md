# Agent Note: 项目经理测试数字员工

Status: implemented

[English](2026-08-30-project-manager-test-digital-employee.md) | 中文

## 问题

最小数字员工示例无法证明员工声明的 skills、tools、MCP 客户端、instructions 与长期记忆会通过生产 Agent 路径共同组合。参考测试需要覆盖这些能力类型，同时不能依赖模型凭据、网络服务或生产项目管理 provider。

## 决策

`@deepseek-ai/dsh-project-manager-test-digital-employee` 提供离线的 `project-manager-test` 模板。它保留 `1.0.0` 供已有员工使用，并为新员工发布 `1.1.0`。新修订会在创建员工的同一持久化更新中写入一条带有包内溯源的非敏感 Atlas 长期记忆。

根项目经理拥有静态 Atlas skills、project-board 与 project-document 工具、stdio project-data MCP server 和项目经理指令。它可以向包内 Risk Reviewer 委派一次审查。该专家仅拥有 risk-review skill、项目证据工具、project-data MCP 访问权限和长期记忆访问权限；其零额外深度预算、空专家列表和禁用的通用 subagent 会阻止后代委派。

组装后的 headless fixture 通过 Host 管理网关创建员工，并记录模板列表、已初始化记忆、专家发现、已委派的风险审查、作用域化专家 MCP 使用、被拒绝的后代委派和持久化根结果。Web 开发 bundle 注册该模板、skills、tools 和 MCP manager，使数字员工管理工作区可以创建并激活 `Project Manager (Test)` 实例。

每个 MCP 客户端实例名称由员工、Agent Session 和 MCP 声明共同派生。因此，根数字员工会话和专家子会话可以并发挂载同一项已声明的 MCP server。

## 考虑过的替代方案

- **在单个测试内 mock 所有结果**：这不能证明模板的包内声明能在员工 Agent 上解析和挂载。
- **将完整能力集合加入最小示例模板**：这会失去用于隔离通用组合行为的无能力基线。
- **使用生产项目管理服务**：这会为无密钥测试引入凭据、网络波动和外部数据。

## 结果

数字员工组合拥有一个通过正常运行时接线覆盖模板记忆初始化和有界专家委派、并能在 Web 开发管理工作区中发现的确定性参考包。并发的根会话和专家会话获得独立的 MCP 客户端实例，同时保持相同的员工授权。该 fixture 保持刻意狭窄：它使用固定 Atlas 数据，只授予一个最小权限 Risk Reviewer，不授予通用 subagent，也不代表生产项目管理集成。
