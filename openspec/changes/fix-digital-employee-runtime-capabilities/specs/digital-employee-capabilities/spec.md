## ADDED Requirements

### Requirement: Authorized Skills include their invocation infrastructure

The system SHALL publish and load every model-invocable Skill authorized for a digital employee without requiring the employee template or instance to grant the shared Skill loader as a business Tool. Business Tool restrictions MUST NOT remove the catalog or loader required to use otherwise authorized Skills.

#### Scenario: Employee grants Skills without granting the Skill loader

- **WHEN** an employee authorizes one or more model-invocable Skills and its business Tool allowlist does not name the shared Skill loader
- **THEN** the Agent receives a catalog containing only its authorized model-invocable Skills
- **THEN** the Agent can load an authorized Skill's instructions
- **THEN** the shared loader does not appear as an administrator-selectable marketplace Tool grant

#### Scenario: Employee does not grant a Skill

- **WHEN** a Skill exists in the selected preset but is absent from the employee's Skill authorization
- **THEN** the Agent catalog omits that Skill and an attempted model load is rejected

### Requirement: Skill-enabled compositions are validated end to end

The system SHALL reject or diagnose a digital employee composition that authorizes model-invocable Skills but cannot publish and load those Skills in the resulting Agent scope.

#### Scenario: Selected preset lacks Skill invocation support

- **WHEN** template validation composes a preset for a draft that authorizes model-invocable Skills and the resulting Agent cannot expose the Skill catalog and loader
- **THEN** validation identifies the unavailable Skill invocation support and prevents publication

#### Scenario: Selected preset supports authorized Skills

- **WHEN** template validation composes a preset whose resulting Agent can publish and load every authorized model-invocable Skill
- **THEN** validation accepts the Skill runtime composition without requiring an extra Tool grant
