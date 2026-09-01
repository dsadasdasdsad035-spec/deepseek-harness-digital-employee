## ADDED Requirements

### Requirement: Authored capabilities are validated before publication

The system SHALL validate every skill, tool, MCP client, and credential reference in an administrator-authored template before publishing and SHALL reject references that cannot be composed under the employee's declared authority.

#### Scenario: Template refers to an available capability

- **WHEN** a draft declares an installed skill, registered tool, or registered MCP client permitted by the employee definition
- **THEN** validation accepts the reference for preview and publication

#### Scenario: Template refers to an unavailable capability

- **WHEN** a draft declares a skill, tool, or MCP client that cannot be resolved or authorized
- **THEN** validation reports the reference and does not publish the template

### Requirement: Authored templates store credential references only

The system SHALL persist only credential references in administrator-authored drafts and published template versions and SHALL reject resolved credential values from all configuration-studio requests and responses.

#### Scenario: Configuration response includes an MCP client

- **WHEN** the configuration studio returns a draft or published version containing an MCP client
- **THEN** the response includes its credential reference when configured and contains no credential value
