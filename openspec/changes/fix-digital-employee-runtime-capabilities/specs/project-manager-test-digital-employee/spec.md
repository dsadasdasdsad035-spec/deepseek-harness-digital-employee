## MODIFIED Requirements

### Requirement: Reference workflow remains deterministic and offline

The project-manager test employee SHALL support an assembled test workflow covering model-visible Skill discovery and loading, project planning, risk reporting, MCP reads, business Tool use, and memory retrieval without real model, network, or credential dependencies.

#### Scenario: Assembled reference workflow

- **WHEN** the test harness starts an isolated `project-manager-test` employee and submits the fixture workflow through the same task-start behavior used by employee chat
- **THEN** the model request contains a Skill catalog naming the authorized project-management Skills
- **THEN** the fixture model invokes the shared Skill loader for an authorized Skill and receives that Skill's package-owned instructions
- **THEN** the observable result identifies the used Skill, business Tools, MCP client, and relevant long-term memory
- **THEN** the model-facing Tool surface excludes undeclared business Tools
- **THEN** the same fixture produces portable output on macOS and Linux without environment-specific normalization
