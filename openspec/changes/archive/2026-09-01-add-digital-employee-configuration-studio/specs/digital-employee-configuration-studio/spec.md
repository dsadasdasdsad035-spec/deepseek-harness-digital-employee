## Purpose

Provide a local administrator workspace for safely authoring, validating, previewing, and publishing reusable digital employee template versions without exposing configuration complexity to ordinary employee users.

## ADDED Requirements

### Requirement: Administrator manages template drafts

The system SHALL let the local administrator create, inspect, update, and discard unpublished employee template drafts containing display metadata, main-agent instructions, expert definitions, capability references, MCP references, and employee-creation memory seeds.

#### Scenario: Administrator creates a draft

- **WHEN** the administrator saves complete draft metadata and configuration
- **THEN** the system records an unpublished draft without changing any published template or employee instance

#### Scenario: Ordinary employee user opens management

- **WHEN** a non-administrator opens the digital employee management workspace
- **THEN** the system exposes employee operations and does not expose draft authoring or publishing actions

### Requirement: Draft validation reports actionable diagnostics

The system SHALL validate a draft before preview or publishing and SHALL report every resolvable error without publishing invalid configuration.

#### Scenario: Draft contains an unresolved reference

- **WHEN** a draft names a skill, tool, MCP client, or credential reference unavailable in the current installation
- **THEN** validation reports the named unresolved reference and rejects preview and publishing

#### Scenario: Draft embeds a credential value

- **WHEN** a draft contains a resolved credential value instead of a credential reference
- **THEN** validation rejects the draft and the value is not persisted or returned to the Web client

#### Scenario: Draft exceeds its authority

- **WHEN** an expert definition requests a capability or delegation depth unavailable to its parent employee definition
- **THEN** validation reports the escalation and rejects preview and publishing

### Requirement: Administrator previews validated drafts in isolation

The system SHALL let the administrator start a temporary preview only from a valid draft and SHALL isolate preview sessions, memory, and capability activity from durable employee data.

#### Scenario: Administrator starts a preview

- **WHEN** validation succeeds and the administrator starts a preview
- **THEN** the system creates a temporary employee composition and a preview session using the draft configuration

#### Scenario: Preview writes memory

- **WHEN** a preview session invokes a memory capability
- **THEN** the resulting memory is isolated from durable employee memory and is discarded when the preview ends

### Requirement: Publishing creates immutable template versions

The system SHALL publish a validated draft as a new immutable template version and SHALL preserve the source draft and publication audit record.

#### Scenario: Administrator publishes a draft

- **WHEN** a valid draft is published
- **THEN** the system creates a version that can be selected for new employees and considered by explicit employee upgrades

#### Scenario: Administrator edits a published template

- **WHEN** the administrator requests changes to a published version
- **THEN** the system creates or updates a separate unpublished draft and leaves the published version unchanged
