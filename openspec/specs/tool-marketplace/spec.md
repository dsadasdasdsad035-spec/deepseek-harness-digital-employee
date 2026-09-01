# tool-marketplace Specification

## Purpose
Provide a safe user-facing marketplace for acquiring managed, versioned Tool packages without allowing an uploaded archive to execute arbitrary Host code during installation.
## Requirements
### Requirement: Tool package inventory and lifecycle
The system SHALL list managed Tool packages with their identity, display metadata, version, publisher, permission declaration, installed state, and restart requirement, and SHALL support install, explicit upgrade, and uninstall from a ZIP artifact.

#### Scenario: Install a new managed Tool package
- **WHEN** a user uploads a valid Tool package whose identity is not installed
- **THEN** the system publishes the complete package atomically to the configured user Tool directory
- **THEN** the inventory reports the package and whether restarting the Host is required before its tools are available

#### Scenario: Upgrade or uninstall a managed Tool package
- **WHEN** a user explicitly confirms an upgrade or uninstall for a managed Tool package
- **THEN** the system changes only the matching managed installation atomically
- **THEN** hand-managed or incompatible same-name directories remain unchanged

### Requirement: Tool package trust and archive safety
The system MUST reject an invalid signature, untrusted publisher, malformed or unsafe ZIP archive, path traversal, symbolic link, duplicate normalized path, unsupported entry type, invalid manifest, or package exceeding declared resource limits.

#### Scenario: Reject an unsafe Tool upload
- **WHEN** a Tool package fails archive, descriptor, or publisher verification
- **THEN** the system returns a structured actionable failure without exposing an absolute Host path
- **THEN** no candidate files become visible in the configured Tool directory

#### Scenario: Reject untrusted executable content
- **WHEN** a Tool package contains executable content from a publisher not trusted by the local marketplace configuration
- **THEN** the system refuses installation
- **THEN** it does not load or evaluate package content in the running Host

### Requirement: Tool permission disclosure
The system SHALL show every Tool package's declared tool names, input descriptions, credential-reference requirements, and requested permission categories before installation and before granting the tools to a digital employee template.

#### Scenario: Review requested Tool permissions
- **WHEN** a user selects a Tool package for installation or an administrator selects one of its tools for a template
- **THEN** the UI presents the tool identity and declared permissions before confirmation
- **THEN** the template stores only the selected registered tool names after authorization
