## MODIFIED Requirements

### Requirement: Management UI exposes operational state

The Web application SHALL provide employee list, employee details, memory, capabilities, experts, task tree, and audit views with actions appropriate to lifecycle state, and SHALL provide a separate administrator-only template configuration view.

#### Scenario: User opens a running employee

- **WHEN** the employee has active expert and subagent work
- **THEN** the details view shows the Agent tree, statuses, and available interruption or continuation actions

#### Scenario: Administrator opens the configuration studio

- **WHEN** the local administrator selects the template configuration view
- **THEN** the Web application shows drafts, published versions, validation results, preview actions, and publishing actions separately from employee instance operations
