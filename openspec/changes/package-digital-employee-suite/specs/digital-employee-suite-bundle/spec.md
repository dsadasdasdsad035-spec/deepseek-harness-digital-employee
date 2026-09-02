## Purpose

Provide a distributable Harness bundle that installs the complete digital employee experience into another project without copying machine-local employees, credentials, templates, or marketplace packages.

## ADDED Requirements

### Requirement: Installable suite bundle

The system SHALL provide one publishable bundle whose manifest declares the digital employee Host, client, remote API, persistence, chat-mention, and optional Skill, Tool, and MCP marketplace components without duplicate loader or remote namespace registrations.

#### Scenario: Install suite in another Harness project

- **WHEN** an administrator adds the suite bundle to a supported Harness profile and starts the Web Host
- **THEN** the Host loads the digital employee management service and the Web client exposes the digital employee workspace
- **THEN** the Host reports a clear startup diagnostic if a required dependency is unavailable

### Requirement: Target-home data isolation

The system MUST resolve durable employees, configuration drafts, published template resources, Skill installations, Tool installations, and MCP packages relative to the target project's Harness home, and MUST NOT include source-machine data or resolved credentials in the bundle artifact.

#### Scenario: Install suite on a clean machine

- **WHEN** the suite starts with a new Harness home
- **THEN** it creates or reads only that home’s data stores
- **THEN** it does not reference absolute paths from the bundle author’s machine

### Requirement: Bundle lifecycle

The system SHALL support installation, upgrade, and removal of the suite through the standard Harness profile and package lifecycle while preserving user data unless the administrator explicitly requests data removal.

#### Scenario: Upgrade suite

- **WHEN** an administrator upgrades the suite bundle
- **THEN** the profile keeps its user-owned data and configuration layers
- **THEN** the next Host start validates all installed digital employee and marketplace references before activation

#### Scenario: Remove suite

- **WHEN** an administrator removes the suite bundle
- **THEN** the bundle-owned loader entries and Web contributions are no longer loaded
- **THEN** user-owned employee, template, credential, and marketplace files remain untouched

### Requirement: Cross-project verification

The project SHALL include an isolated test that installs the suite into a temporary Harness home and verifies the Web entry points, Template configuration, marketplace inventory, and `@数字员工` input source.

#### Scenario: Fresh installation smoke test

- **WHEN** the isolated test boots the suite with empty user data
- **THEN** the digital employee and market UI contributions are present
- **THEN** the test can create a draft without reading data from the developer’s real Harness home
