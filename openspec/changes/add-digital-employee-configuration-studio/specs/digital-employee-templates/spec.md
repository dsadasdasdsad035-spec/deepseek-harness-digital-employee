## ADDED Requirements

### Requirement: Locally published template versions are resolvable

The system SHALL make a locally published immutable employee template version available through the same template resolution and version-selection behavior as a plugin-contributed template version.

#### Scenario: User selects a published template version

- **WHEN** a locally published version is installed and valid
- **THEN** it appears as a selectable template version for new employee instances

#### Scenario: Published version is used for an upgrade

- **WHEN** an employee upgrade targets a locally published version
- **THEN** the system performs the existing explicit upgrade comparison and authorization review before changing the instance

### Requirement: Published templates preserve provenance

The system SHALL retain the draft identity, publication time, and local publisher identity for every locally published template version.

#### Scenario: Administrator inspects version history

- **WHEN** the administrator opens a published template version
- **THEN** the system returns its immutable configuration and its publication provenance without exposing credential values
