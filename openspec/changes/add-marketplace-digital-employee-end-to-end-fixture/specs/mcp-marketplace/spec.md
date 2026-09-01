## ADDED Requirements

### Requirement: Marketplace provides an installable offline MCP example
The MCP marketplace SHALL provide a downloadable declarative example package with a stable server identity, Streamable HTTP transport configuration, a non-sensitive endpoint reference, a declared credential-reference requirement, and no embedded endpoint or credential value.

#### Scenario: User installs and configures the MCP example
- **WHEN** a user uploads the unmodified example ZIP and the Host supplies its endpoint reference and required credential reference
- **THEN** the marketplace installs the package and stores only the credential reference
- **THEN** it reports that a Host restart is required before the MCP client is active

### Requirement: MCP endpoint references resolve outside package content
An MCP package MAY declare a non-sensitive endpoint reference instead of a fixed URL, and the Host SHALL resolve that reference from explicit local configuration before activation without rewriting the installed package.

#### Scenario: Endpoint reference is configured
- **WHEN** an installed package declares an endpoint reference present in Host configuration
- **THEN** activation uses the configured URL
- **THEN** marketplace and template projections expose the resolved non-secret endpoint required for runtime composition

#### Scenario: Endpoint reference is unavailable
- **WHEN** an installed package declares an endpoint reference absent from Host configuration
- **THEN** the package remains unavailable with an endpoint diagnostic
- **THEN** no MCP client is mounted for that server

### Requirement: Example MCP activation can be verified offline
The installed example MCP client SHALL connect after Host restart to a local test server that exposes a deterministic Tool without requiring internet access or a real external credential.

#### Scenario: Example MCP client is pending activation
- **WHEN** the example package has been installed and configured but the Host has not restarted
- **THEN** its MCP server is identified as unavailable and cannot be newly selected for a template

#### Scenario: Example MCP client is active
- **WHEN** a local fixture resolves the configured credential reference and the Host restarts with the same managed MCP directory
- **THEN** the MCP server and its declared Tool are available to an authorized digital employee
- **THEN** a valid Tool request returns the fixture's deterministic response
