## ADDED Requirements

### Requirement: Mention-started tasks receive the effective employee runtime

The Host SHALL start a task submitted through an employee mention with the employee's effective authorized Skills, business Tools, MCP clients, instructions, experts, and bounded relevant memory. A successful start MUST NOT rely on the browser to compose or repair those capabilities.

#### Scenario: User starts a Skill-enabled employee

- **WHEN** a user submits a task to an active employee whose template authorizes model-invocable Skills
- **THEN** the new employee-owned Session exposes those Skills through the model-facing catalog and loader
- **THEN** the employee's business Tool grants remain limited to the template and instance authorization

#### Scenario: User starts an employee with relevant memory

- **WHEN** a user's submitted task is relevant to long-term memory owned by the selected employee
- **THEN** the new Session receives a bounded projection of that employee's relevant memory before its first model request
- **THEN** memory belonging to another employee is not included
