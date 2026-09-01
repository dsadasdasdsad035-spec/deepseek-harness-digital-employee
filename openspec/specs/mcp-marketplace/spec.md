# mcp-marketplace Specification

## Purpose
Provide a safe marketplace for managed MCP client packages and their credential-reference configuration without exposing or persisting resolved secret values.
## Requirements
### Requirement: MCP package inventory and lifecycle
The system SHALL list managed MCP client packages with identity, display metadata, version, publisher, transport summary, declared server names, credential-reference requirements, and installed state, and SHALL support ZIP install, explicit upgrade, and uninstall.

#### Scenario: Install an MCP client package
- **WHEN** a user uploads a valid trusted MCP client package
- **THEN** the system publishes the managed package atomically in the configured user MCP directory
- **THEN** the package becomes available for local MCP client configuration after any required restart

#### Scenario: Preserve unmanaged MCP configuration
- **WHEN** an install, upgrade, or uninstall targets a name occupied by an unmanaged or incompatible MCP configuration
- **THEN** the system refuses the mutation with a structured ownership failure
- **THEN** the existing configuration remains unchanged

### Requirement: Credential-reference-only configuration
The system SHALL allow a user to supply or select credential references required by an installed MCP package, and MUST NOT persist, return, log, or display resolved credential values.

#### Scenario: Configure an MCP credential reference
- **WHEN** a package requires an authorization value and the user saves a valid credential reference
- **THEN** the system records only the reference associated with the MCP client configuration
- **THEN** subsequent marketplace and template inventory responses omit the resolved value

#### Scenario: Reject a resolved credential value
- **WHEN** an MCP package request contains a resolved credential value where a reference is required
- **THEN** the system rejects the request
- **THEN** the value is not written to the managed package or returned to the Web client

### Requirement: MCP package trust and archive safety
The system MUST apply the same bounded ZIP, normalized-path, publisher-trust, and atomic-publication protections to MCP client packages as to Tool packages.

#### Scenario: Reject an unsafe MCP package
- **WHEN** an MCP client package fails archive, descriptor, or publisher verification
- **THEN** the system returns a structured failure
- **THEN** no candidate package or partial MCP configuration becomes discoverable
