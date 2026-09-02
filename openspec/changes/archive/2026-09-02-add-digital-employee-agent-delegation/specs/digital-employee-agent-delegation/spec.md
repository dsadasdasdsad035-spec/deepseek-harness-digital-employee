## Purpose

让数字员工主 Agent 能在聊天任务中安全调用模板授权的专家 Agent 和普通 subagent，并让每个子 Agent 继承明确、不可升级的执行权限。

## ADDED Requirements

### Requirement: The model can delegate to an authorized expert

The system SHALL expose a model-callable delegation operation that accepts an authorized expert identifier and a non-empty task prompt, and SHALL execute it only when that expert is enabled for the active digital employee.

#### Scenario: Authorized expert delegation succeeds

- **WHEN** the model delegates a non-empty task to an expert enabled by the active employee template and instance
- **THEN** the system creates the configured one-shot or continuable expert child and returns its result or durable child identity

#### Scenario: Unknown expert delegation is rejected

- **WHEN** the model requests an expert that is not present in the active employee's authorized expert catalog
- **THEN** the system rejects the request and records an authorization denial without creating a child Session

### Requirement: Delegated experts receive their declared composition

The system SHALL compose an expert child with its authorized instructions, personality, skills, tools, MCP clients, memory context, and model settings, subject to the intersection with the active employee and parent Agent permissions.

#### Scenario: Expert uses an authorized capability

- **WHEN** an authorized expert child selects one of its declared skills or calls one of its declared tools or MCP tools
- **THEN** the capability is available in the child scope and the use is attributed to the employee, expert, Session, and acting Agent

#### Scenario: Expert requests a capability outside the intersection

- **WHEN** an expert declaration includes a capability not authorized by the employee instance or parent Agent
- **THEN** that capability is unavailable to the child and the request is rejected or omitted according to the existing capability authorization policy

### Requirement: Delegation policy limits child execution

The system SHALL enforce configured maximum depth, concurrency, timeout, provider availability, and background/continuation mode for expert and ordinary subagent delegation.

#### Scenario: Delegation exceeds a configured limit

- **WHEN** a delegation would exceed any applicable depth, concurrency, timeout, or mode constraint
- **THEN** the system rejects or terminates the delegation with a diagnostic and records the policy outcome

#### Scenario: Provider is unavailable

- **WHEN** a requested delegation provider is not available in the installation
- **THEN** the system returns a provider diagnostic and does not expose a successful child identity

### Requirement: Ordinary subagents are policy-controlled

The system SHALL expose ordinary subagent delegation only when the active Agent and Web preset permit it, and SHALL apply the same lifecycle and depth protections to its child Sessions.

#### Scenario: Web Agent delegates an ordinary subagent

- **WHEN** the Web preset enables ordinary subagent delegation and the model submits a valid prompt
- **THEN** a child subagent is started through the registered provider and its synchronous or background result is returned according to the request

#### Scenario: Ordinary subagent delegation is disabled

- **WHEN** the active Web preset does not authorize ordinary subagent delegation
- **THEN** the delegation tool is absent or returns an explicit unavailable diagnostic without creating a child Session
