## ADDED Requirements

### Requirement: Mention-started reference conversation exercises marketplace capabilities
The assembled Web workflow SHALL support starting a new conversation with the reference employee through the leading `@` picker and SHALL execute a deterministic task that uses its selected Skill, Tool, and MCP Tool.

#### Scenario: User starts the reference employee task
- **WHEN** a user selects the active reference employee with the leading `@` picker and submits the reference task
- **THEN** the Host creates an employee-owned root Session through the normal task-start operation
- **THEN** the conversation demonstrates the example Skill instruction, example Tool result, and example MCP Tool result

#### Scenario: Conversation cannot access an undeclared marketplace capability
- **WHEN** the deterministic task attempts to discover or use a marketplace capability not selected by the reference template
- **THEN** the capability is absent or denied
- **THEN** the conversation remains owned by the selected employee
