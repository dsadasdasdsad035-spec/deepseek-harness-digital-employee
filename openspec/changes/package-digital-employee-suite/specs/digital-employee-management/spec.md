## MODIFIED Requirements

### Requirement: Template and marketplace composition

The management Host SHALL resolve templates and selected Skill, Tool, and MCP references from the active target installation, and SHALL reject unavailable references with actionable diagnostics rather than silently falling back to the source or Host-global installation.

#### Scenario: Suite template uses target capabilities

- **WHEN** an administrator creates an employee from a suite template
- **THEN** the employee receives only capabilities available in the target Host composition
- **THEN** unavailable references prevent creation and identify the affected capability

#### Scenario: Source machine is unavailable

- **WHEN** a suite-installed Host runs without access to the machine that produced the bundle
- **THEN** employee creation and template listing do not attempt to read source-machine paths
