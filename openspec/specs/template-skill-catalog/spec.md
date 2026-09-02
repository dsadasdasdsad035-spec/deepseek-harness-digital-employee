# template-skill-catalog Specification

## Purpose

Provide template configuration with one deterministic, client-safe skill catalog that combines runtime availability with marketplace provenance and display metadata.

## Requirements

### Requirement: Template configuration receives a merged skill catalog

The system SHALL resolve Skill availability from the Agent preset selected by the template draft, SHALL merge that preset-scoped runtime catalog with the installed marketplace inventory by stable Skill name, and SHALL NOT substitute the unscoped Host registry when preset resolution fails.

#### Scenario: Active marketplace skill is merged for the selected preset

- **WHEN** a marketplace-managed Skill is installed and the selected preset's scoped runtime catalog contains its name
- **THEN** the catalog returns one selectable Skill entry with runtime availability and marketplace metadata

#### Scenario: Active local skill is included for the selected preset

- **WHEN** a non-market local Skill is present in the selected preset's scoped runtime catalog
- **THEN** the catalog returns the Skill as selectable and identifies it as a local non-market Skill

#### Scenario: Installed marketplace skill is absent from the selected preset

- **WHEN** a Skill exists in the installed marketplace inventory but not in the selected preset's scoped runtime catalog
- **THEN** the catalog returns the Skill as unavailable, prevents new selection, and explains that the selected preset does not currently expose it

#### Scenario: Different presets expose different skills

- **WHEN** two presets produce different scoped runtime Skill catalogs
- **THEN** requesting template assets for each preset returns availability that matches that preset without leaking the other preset's scoped Skills

#### Scenario: Selected preset cannot be previewed

- **WHEN** the requested preset is unknown, invalid, or fails to compose
- **THEN** the asset request reports a preset diagnostic and does not return Host-global Skills as selectable substitutes

### Requirement: Preset-scoped catalog preview creates no task runtime

The system SHALL inspect a preset's standing scoped composition for template configuration without creating or publishing an Agent, Session, turn, or model request.

#### Scenario: Administrator opens template configuration

- **WHEN** the system resolves the selected preset's Skill catalog
- **THEN** no task Session, live Agent, model request, or user-visible conversation is created

#### Scenario: Concurrent drafts use the same preset

- **WHEN** multiple asset requests preview the same unchanged preset concurrently
- **THEN** they share the preset composition lifecycle and return deterministic Skill availability

### Requirement: Marketplace metadata is projected without changing template identity

The system SHALL expose marketplace version, author, tags, source, and restart status for marketplace-managed skill entries, while templates SHALL continue to store skill names as their capability references.

#### Scenario: Marketplace metadata is displayed

- **WHEN** an administrator views a marketplace-managed skill in template configuration
- **THEN** the UI displays its available version, author, tags, marketplace source, and restart status

#### Scenario: Template is saved with a marketplace skill

- **WHEN** an administrator selects a marketplace-managed skill and saves the draft
- **THEN** the draft stores the stable skill name without copying marketplace display metadata into the template capability list

### Requirement: Skill catalog responses are client-safe and deterministic

The system SHALL return one entry per skill name in deterministic display order and SHALL NOT expose Host filesystem paths, archive filenames, or credential values.

#### Scenario: Duplicate sources describe one skill

- **WHEN** runtime and marketplace sources both describe the same skill name
- **THEN** the catalog returns exactly one merged entry for that name

#### Scenario: Catalog is requested repeatedly

- **WHEN** the underlying runtime and marketplace inventories have not changed
- **THEN** repeated catalog requests return entries in the same order with the same client-safe fields
