## ADDED Requirements

### Requirement: Employee skills are model-visible and loadable

数字员工的授权技能 SHALL 出现在该员工的会话技能目录中，且 SHALL 可经元能力工具按名加载。目录内容 SHALL 等于该员工的授权技能集合（模板声明与实例授权的交集，再与调用 Agent 的继承权限相交），SHALL NOT 包含任何越权技能。技能目录 SHALL 在员工首个回合前即已就绪，且与员工单聊、公司群成员会话等所有承载该员工的会话一致。

#### Scenario: 员工介绍自己的技能

- **WHEN** 询问一名数字员工它有哪些技能
- **THEN** 其会话技能目录已列出该员工的授权技能，模型据此回答的技能集合与授权一致，而非从指令文本推断

#### Scenario: 越权技能不可见且不可加载

- **WHEN** 员工授权范围之外的技能存在于部署中
- **THEN** 该技能不出现在该员工的目录中，且以该技能名加载被拒绝

#### Scenario: 技能目录与承载会话无关

- **WHEN** 同一员工在单聊与会话中分别被提问
- **THEN** 两处都呈现同一份授权技能目录

#### Scenario: 缺少目录加载体时组合失败

- **WHEN** 员工 preset 声明了技能但未挂载技能目录/加载器
- **THEN** 组合在最早可解析点失败并给出诊断，而非静默产出无目录的员工

## MODIFIED Requirements

### Requirement: Employee capabilities are explicitly authorized

The system SHALL expose only capabilities present in the intersection of the employee template declaration, employee instance authorization, calling Agent's inherited permissions, and, for delegated children, the selected expert or subagent policy. 员工的业务工具白名单 SHALL NOT 裁剪提供授权技能目录的元能力工具：授权调整只约束业务工具，技能可见性与加载性由授权技能集合自身决定。

#### Scenario: Authorized capability is composed

- **WHEN** a skill, tool, or MCP service is declared by the template and authorized for the instance and parent Agent
- **THEN** the employee or expert can use that capability

#### Scenario: Delegated expert receives the capability intersection

- **WHEN** a parent Agent delegates to an expert whose declared capabilities are a subset of the employee and parent grants
- **THEN** the child receives exactly the intersection and cannot access capabilities outside it

#### Scenario: Child requests an unavailable capability

- **WHEN** an expert or subagent requests a capability absent from any authorization layer
- **THEN** the request is rejected and the denied capability is not registered in the child's context

#### Scenario: 业务工具裁剪不影响技能目录

- **WHEN** 员工的授权业务工具集合为任意值（含空集）
- **THEN** 该员工的授权技能目录仍对模型可见且可加载
