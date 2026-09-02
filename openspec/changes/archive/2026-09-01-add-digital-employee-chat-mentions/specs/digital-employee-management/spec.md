## MODIFIED Requirements

### Requirement: Management UI exposes operational state

The Web application SHALL provide employee list, employee details, memory, capabilities, experts, task tree, and audit views with actions appropriate to lifecycle state, and SHALL route new employee work through the chat composer.

#### Scenario: User opens a running employee

- **WHEN** the employee has active expert and subagent work
- **THEN** the details view shows the Agent tree, statuses, and available interruption or continuation actions

#### Scenario: User starts a chat from employee management

- **WHEN** a user invokes `Start chat` for an active employee
- **THEN** the Web application opens a new-task chat composer with that employee selected without creating an empty Session

#### Scenario: User attempts to start a chat for an inactive employee

- **WHEN** an employee is not active
- **THEN** the management UI does not offer an enabled `Start chat` action
