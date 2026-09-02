## Purpose

Provide template configuration with one deterministic, client-safe skill catalog that combines runtime availability with marketplace provenance and display metadata.

## ADDED Requirements

### Requirement: Template configuration receives a merged skill catalog

The system SHALL merge the runtime skill registry and the installed marketplace skill inventory by stable skill name before returning template configuration assets.

#### Scenario: Active marketplace skill is merged

- **WHEN** a skill name exists in both the runtime registry and the installed marketplace inventory
- **THEN** the catalog returns one selectable skill entry with runtime availability and marketplace metadata

#### Scenario: Active local skill is included

- **WHEN** a skill exists in the runtime registry but has no marketplace-managed installation
- **THEN** the catalog returns the skill as selectable and identifies it as a local non-market skill

#### Scenario: Installed marketplace skill is not active

- **WHEN** a skill exists in the installed marketplace inventory but not in the runtime registry
- **THEN** the catalog returns the skill as unavailable, prevents new selection, and provides restart or activation guidance

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
