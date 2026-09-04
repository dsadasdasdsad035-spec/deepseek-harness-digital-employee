## Purpose

Lets users create, edit, and delete unpackaged MCP server configurations directly from the market MCP tab, with immediate effect and no publisher packaging.

## ADDED Requirements

### Requirement: Direct MCP configuration maintenance
The system SHALL allow a user to create, edit, list, and delete user-declared MCP server configurations from the market MCP tab without a signed package, for both `streamable-http` (url, headers) and `stdio` (command, args, env) transports, and SHALL persist entries across Host restarts.

#### Scenario: Create a Streamable HTTP server
- **WHEN** a user saves a direct configuration with a valid unique server name, url, and headers
- **THEN** the system persists the entry with no resolved credential values
- **THEN** the server becomes available without a Host restart

#### Scenario: Delete a direct configuration
- **WHEN** a user deletes an existing direct-config entry
- **THEN** the system removes the entry, unmounts its live server, and its name becomes reusable

### Requirement: Hot mount and unmount
The system SHALL mount a saved direct-config server on save and unmount a deleted or renamed server immediately, using the same client-manager mount path as packaged servers, without requiring a Host restart.

#### Scenario: Save takes effect immediately
- **WHEN** a user saves a valid direct-config entry
- **THEN** the server's tools become available to the running agent without a restart

#### Scenario: Edit replaces the live server
- **WHEN** a user edits a mounted direct-config entry and the new configuration is valid
- **THEN** the system unmounts the previous server and mounts the replacement under the same or new name as declared
- **THEN** no tools from the previous configuration remain callable

### Requirement: stdio local-execution confirmation on save
The system MUST require an explicit local-execution confirmation when a direct-config entry is created as a stdio server or edited into a stdio transport, and MUST apply the same bare-interpreter allowlist as packaged stdio servers before mounting.

#### Scenario: Save a stdio entry without confirmation
- **WHEN** a user saves a stdio direct-config entry without the local-execution confirmation
- **THEN** the system refuses the mutation with a structured confirmation-required failure
- **THEN** no subprocess is started and the entry is not persisted

#### Scenario: Reject a non-allowlisted interpreter
- **WHEN** a stdio direct-config entry names a command outside the configured interpreter allowlist
- **THEN** the system rejects the save with a structured interpreter failure

### Requirement: Credential-reference-only slots in direct configuration
The system SHALL support credential references on HTTP header slots and stdio env slots of direct-config entries under the same empty-fixed-value rule as packaged servers, and MUST NOT persist, return, log, or display resolved credential values for direct configurations.

#### Scenario: Save a credential-backed header
- **WHEN** a user saves a direct HTTP entry whose header slot has an empty fixed value and a credential reference
- **THEN** the system records only the reference name
- **THEN** the mounted server resolves the value through the credential mechanism at mount time

#### Scenario: Reject a resolved credential value
- **WHEN** a direct-config request carries a non-empty value on a slot bound to a credential reference
- **THEN** the system rejects the request and the value is not persisted

### Requirement: Server-name uniqueness across configurations and packages
The system SHALL enforce server-name uniqueness across direct-config entries and managed packages in both directions, returning structured ownership or conflict failures that identify the colliding entry.

#### Scenario: Direct config collides with a package server
- **WHEN** a user saves a direct-config entry whose server name matches a server declared by an installed package
- **THEN** the system refuses the save with a structured conflict failure naming the package

#### Scenario: Package install collides with a direct config
- **WHEN** a package install would declare a server name held by a direct-config entry
- **THEN** the system refuses the install with a structured conflict failure
