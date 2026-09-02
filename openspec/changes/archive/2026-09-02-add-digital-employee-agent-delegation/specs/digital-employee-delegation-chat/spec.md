## Purpose

让 Web 聊天中的 `@数字员工` 会话能够发现、调用并观察专家 Agent 与 subagent 的委派过程，同时保持主会话与子会话之间清晰的身份和结果关联。

## ADDED Requirements

### Requirement: Delegation tools are visible in the employee chat scope

The system SHALL publish only the delegation tools authorized for the active digital employee and SHALL expose tool descriptions and input schemas that identify required prompts, expert identifiers, execution mode, and background behavior.

#### Scenario: Chat scope publishes an authorized expert tool

- **WHEN** a user starts a chat with a digital employee whose template grants at least one expert
- **THEN** the model tool catalog contains the expert delegation operation with the authorized expert choices or validation contract

#### Scenario: Chat scope has no delegation authority

- **WHEN** the active employee has no authorized experts and ordinary subagents are disabled
- **THEN** no usable delegation operation is published to the model

### Requirement: Delegation results are linked to the parent chat

The system SHALL record delegation request, acceptance or denial, child identity, completion outcome, and diagnostic data in the parent Session without exposing credentials or secret MCP configuration.

#### Scenario: One-shot expert completes

- **WHEN** a delegated one-shot expert finishes
- **THEN** the parent chat receives a result associated with the expert identity and child Session, and the Session contains the corresponding terminal delegation record

#### Scenario: Background child remains active

- **WHEN** a delegated continuable or background child is accepted
- **THEN** the parent chat receives a durable child identity and the Web UI can list or continue that child through the existing child-session lifecycle

### Requirement: Chat delegation failures are actionable

The system SHALL return stable diagnostics for invalid prompts, unauthorized experts, unavailable providers, unavailable capabilities, and policy limits, without leaving an unpublished or orphaned child Session.

#### Scenario: Invalid delegation request

- **WHEN** the model submits an empty prompt or malformed delegation arguments
- **THEN** the tool call fails validation before child publication and returns a diagnostic suitable for the model to correct
