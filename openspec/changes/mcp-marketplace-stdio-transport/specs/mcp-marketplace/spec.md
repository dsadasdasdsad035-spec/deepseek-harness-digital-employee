## MODIFIED Requirements

### Requirement: MCP package inventory and lifecycle
The system SHALL list managed MCP client packages with identity, display metadata, version, publisher, transport summary covering streamable-http and stdio servers including mixed-transport packages, declared server names, credential-reference requirements, permission summary, and installed state, and SHALL support ZIP install, explicit upgrade, and uninstall.

#### Scenario: Install an MCP client package
- **WHEN** a user uploads a valid trusted MCP client package
- **THEN** the system publishes the managed package atomically in the configured user MCP directory
- **THEN** the package becomes available for local MCP client configuration after any required restart

#### Scenario: Install a stdio or mixed MCP client package
- **WHEN** a user uploads a valid trusted MCP client package declaring stdio servers, alone or alongside streamable-http servers
- **THEN** the system publishes the managed package atomically with its executable payload covered by the signed file table
- **THEN** on a fresh Host composition the system mounts stdio servers as local child processes and streamable-http servers as remote clients

#### Scenario: Preserve unmanaged MCP configuration
- **WHEN** an install, upgrade, or uninstall targets a name occupied by an unmanaged or incompatible MCP configuration
- **THEN** the system refuses the mutation with a structured ownership failure
- **THEN** the existing configuration remains unchanged

### Requirement: Credential-reference-only configuration
The system SHALL allow a user to supply or select credential references required by an installed MCP package for HTTP header slots and stdio environment-variable slots, and MUST NOT persist, return, log, or display resolved credential values.

#### Scenario: Configure an MCP credential reference
- **WHEN** a package requires an authorization value, as an HTTP header or a stdio environment variable, and the user saves a valid credential reference
- **THEN** the system records only the reference associated with the MCP client configuration
- **THEN** subsequent marketplace and template inventory responses omit the resolved value

#### Scenario: Reject a resolved credential value
- **WHEN** an MCP package request contains a resolved credential value where a reference is required
- **THEN** the system rejects the request
- **THEN** the value is not written to the managed package or returned to the Web client

#### Scenario: Reject a fixed value on a credential-backed stdio slot
- **WHEN** a stdio server descriptor declares both a fixed non-empty environment value and a credential reference for the same environment-variable name
- **THEN** the system rejects the package at descriptor validation
- **THEN** no candidate package becomes discoverable

## ADDED Requirements

### Requirement: Stdio server execution safety
The system SHALL launch stdio MCP servers only under interpreter commands on the Host-configured allowlist (default `node`), with declared script arguments resolving inside the package's signed file table, the working directory pinned to the managed package directory, and the child environment composed of fixed declared values plus resolved credential references over a scrubbed parent environment.

#### Scenario: Reject a stdio command outside the interpreter allowlist
- **WHEN** a stdio server entry names an interpreter command not present on the Host's configured allowlist
- **THEN** the system rejects the package at descriptor validation with a structured failure naming the command

#### Scenario: Reject an argument path outside the signed file table
- **WHEN** a stdio server entry's script argument escapes the managed package directory or names a file absent from the signed file table
- **THEN** the system rejects the package at descriptor validation
- **THEN** no candidate package or partial MCP configuration becomes discoverable

#### Scenario: Compose the child environment from declared values only
- **WHEN** a configured stdio server is mounted
- **THEN** the child process receives the scrubbed parent environment plus the server's fixed environment values and resolved credential references, and nothing else
- **THEN** resolved credential values never appear in persisted configuration, diagnostics, or session output

#### Scenario: Report a failed stdio mount as a diagnostic
- **WHEN** a configured stdio server cannot be mounted because its interpreter is missing, its payload is corrupt, or its server name conflicts
- **THEN** the system records an explicit diagnostic for that package without preventing other packages from mounting
- **THEN** the failure surfaces in package list output for the user

### Requirement: MCP package permission disclosure
The system SHALL disclose, before install and in package inventory, that a package declaring stdio servers executes local subprocess code, and SHALL present the package's declared permission set alongside Tool package permissions.

#### Scenario: Disclose local execution for stdio packages
- **WHEN** a package declares any stdio server
- **THEN** install confirmation and package inventory present a subprocess execution disclosure
- **THEN** the disclosure is visible before the user confirms installation

#### Scenario: Declarative-only packages carry no execution disclosure
- **WHEN** a package declares only streamable-http servers
- **THEN** package inventory presents no subprocess execution disclosure
