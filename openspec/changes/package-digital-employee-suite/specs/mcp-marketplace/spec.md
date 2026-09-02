## MODIFIED Requirements

### Requirement: MCP package inventory and lifecycle

The system SHALL use the target Harness home’s MCP package root when the suite bundle provides the MCP marketplace, and SHALL expose only successfully validated, configured, and activated MCP declarations to Template configuration.

#### Scenario: Suite exposes a managed MCP

- **WHEN** a valid MCP package is installed and configured in the target project
- **THEN** Template configuration can select its server declaration after required activation
- **THEN** credential values remain absent from bundle files, inventory responses, and template data
