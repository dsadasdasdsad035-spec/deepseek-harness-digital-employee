## MODIFIED Requirements

### Requirement: Capability use is attributable

The system SHALL attribute employee skill selection, tool calls, MCP requests, permission denials, and capability configuration changes to the employee instance, Session, and acting Agent. 审计安装 SHALL 在**员工组合路径**（根任务的创建与恢复）与**专家组合路径**上均取得当前 Agent 并写入记录；取不到 Agent 时 SHALL 以可诊断的方式失败或被明确记录，SHALL NOT 静默跳过。

#### Scenario: Expert invokes an MCP service

- **WHEN** an expert performs an MCP request
- **THEN** the audit record identifies the employee, expert Agent, Session, service, operation, and outcome without recording secret values

#### Scenario: Employee task composition writes capability audit

- **WHEN** 一个员工根任务被创建（或从持久化恢复）并完成能力组装
- **THEN** 该员工的审计记录包含一条能力配置记录，携带该员工实例、其会话与本次组合的 Agent

#### Scenario: Attribution survives the composition scope shape

- **WHEN** 员工组装在 Agent 作用域上下文（Agent 由作用域属性暴露，而非注册服务）中运行
- **THEN** 审计安装仍能取得该 Agent，审计记录照常落盘
