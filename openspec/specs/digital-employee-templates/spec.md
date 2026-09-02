# digital-employee-templates Specification

## Purpose

Define reusable, versioned digital employee templates and durable employee instances that preserve independent identity and state.
## Requirements
### Requirement: Plugins contribute versioned employee templates

The system SHALL allow plugins to contribute digital employee templates with a stable template ID, version, display metadata, personality defaults, an `AGENTS.md` instruction source, capability references, expert definitions, and delegation policy.

#### Scenario: Valid template is registered

- **WHEN** a plugin contributes a complete employee template with unique identity and resolvable references
- **THEN** the template becomes available for employee instance creation

#### Scenario: Invalid template is rejected

- **WHEN** a template omits required metadata, duplicates a live template version, or references a missing required resource
- **THEN** plugin application fails with a diagnostic naming the invalid template and reference

### Requirement: Users create independent instances from one template

The system SHALL allow multiple employee instances to reference the same template while retaining independent stable IDs, display names, personality overrides, authorization, memory, sessions, and lifecycle state.

#### Scenario: Two instances use one template

- **WHEN** a user creates two employees from the same template
- **THEN** changes to one instance's name, memory, authorization, or sessions do not alter the other instance

### Requirement: Runtime composition is resolved explicitly

The system SHALL resolve an employee instance and template version into a complete Agent composition before task execution and SHALL reject unresolved template versions or references before creating a task Session.

#### Scenario: Employee starts a task

- **WHEN** an active employee with a valid template version receives a task
- **THEN** the task Agent receives the resolved identity, personality, instructions, skills, tools, MCP clients, expert catalog, and delegation limits

#### Scenario: Referenced template version is unavailable

- **WHEN** an employee references a template version that is not installed
- **THEN** task creation fails without silently selecting another version

### Requirement: Template drafts authorize skills through the merged catalog

The system SHALL allow administrators to add marketplace-managed and non-market local Skills that are available through the draft's selected Agent preset, SHALL refresh availability when that preset changes, and SHALL prevent adding Skills unavailable to the selected preset.

#### Scenario: Administrator selects an active marketplace skill

- **WHEN** a marketplace-managed Skill is installed and available through the draft's selected preset
- **THEN** the administrator can select it and save its stable Skill name in the draft authority

#### Scenario: Administrator selects an active local skill

- **WHEN** a non-market local Skill is available through the draft's selected preset
- **THEN** the administrator can select it and save its stable Skill name in the draft authority

#### Scenario: Administrator attempts to select a skill outside the preset

- **WHEN** an installed or local Skill is not available through the draft's selected Agent preset
- **THEN** the selector displays it as unavailable and does not add it to the draft authority

#### Scenario: Administrator changes the preset

- **WHEN** the administrator changes a draft from one preset to another
- **THEN** the editor reloads the Skill catalog for the new preset before allowing new Skill selections

### Requirement: Stale skill references remain removable

The system SHALL preserve a draft's selected Skill name in the editing UI when that name is absent or unavailable in the selected preset's merged catalog, SHALL identify the selection as unavailable, and SHALL allow the administrator to remove it.

#### Scenario: Previously selected skill was uninstalled

- **WHEN** an administrator edits a draft that references a Skill no longer present in either marketplace inventory or the selected preset
- **THEN** the selector displays the stale Skill as unavailable and allows it to be deselected

#### Scenario: Preset change invalidates a selected skill

- **WHEN** an administrator changes the preset and a previously selected Skill is unavailable in the new preset
- **THEN** the Skill remains selected and removable with a diagnostic naming the preset mismatch

#### Scenario: Draft retains an unavailable skill

- **WHEN** validation or publication is requested while a stale or preset-unavailable Skill remains selected
- **THEN** the operation reports an unavailable-Skill diagnostic and does not publish the draft

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
