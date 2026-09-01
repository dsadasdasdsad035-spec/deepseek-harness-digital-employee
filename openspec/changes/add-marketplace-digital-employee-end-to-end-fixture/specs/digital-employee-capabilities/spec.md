## ADDED Requirements

### Requirement: Marketplace capability composition is complete and non-escalating
An employee created from the reference template SHALL receive the selected marketplace Skill, Tool, and MCP client through their normal runtime providers and SHALL NOT receive installed marketplace capabilities omitted from the template.

#### Scenario: Employee composition contains selected examples
- **WHEN** a task starts for an active employee whose template selects the three active examples
- **THEN** the employee's model context can load the example Skill
- **THEN** the employee can invoke the example Tool and the example MCP Tool

#### Scenario: Installed capability is not selected
- **WHEN** another marketplace capability is installed and active but absent from the employee template
- **THEN** it is not exposed to the employee or its delegated Agents
- **THEN** an attempted use is rejected or remains unavailable

### Requirement: Example capability use remains attributable
Use of each selected example SHALL be attributable to the employee-owned Session and acting Agent through the same durable events and audit records as other Skill loads, Tool calls, and MCP requests.

#### Scenario: Employee uses all selected examples
- **WHEN** an employee task loads the example Skill and invokes the example Tool and MCP Tool
- **THEN** the durable task record identifies the employee Session and each capability operation without recording credential values
