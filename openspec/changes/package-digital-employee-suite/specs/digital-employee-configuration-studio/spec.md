## MODIFIED Requirements

### Requirement: Administrator manages template drafts

The system SHALL let the local administrator create, inspect, update, and discard unpublished employee template drafts containing display metadata, main-agent instructions, expert definitions, capability references, MCP references, and employee-creation memory seeds. When provided by the suite bundle, these operations SHALL persist under the target Harness home.

#### Scenario: Administrator creates a draft

- **WHEN** the administrator saves complete draft metadata and configuration
- **THEN** the system records an unpublished draft under the target Harness home without changing any published template or employee instance

#### Scenario: Ordinary employee user opens management

- **WHEN** a non-administrator opens the digital employee management workspace
- **THEN** the system exposes employee operations and does not expose draft authoring or publishing actions

### Requirement: Publishing creates immutable template versions

The system SHALL publish a validated draft as a new immutable template version under the target Harness home and SHALL preserve the source draft and publication audit record.

#### Scenario: Administrator publishes a draft

- **WHEN** a valid draft is published in a suite installation
- **THEN** the system creates a version with self-contained instruction resources relative to the target Harness home
- **THEN** the version can be selected for new employees after Host restart
