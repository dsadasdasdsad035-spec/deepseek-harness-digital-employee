## Purpose

Make published digital employee templates distributable as signed packages that import with signature verification and grouped diagnostics for missing market dependencies.

## ADDED Requirements

### Requirement: Employee package format and signing
The system SHALL export any published local template as a signed zip and verify signatures with the marketplace trust machinery.

#### Scenario: Export a published template
- **WHEN** an administrator exports a published template
- **THEN** a signed zip containing the template metadata, files, and references manifest is produced

### Requirement: Import validates references before registration
The system SHALL validate an imported package's signature and references, re-register the template, and report missing market packages as grouped diagnostics.

#### Scenario: Import with satisfied references
- **WHEN** references are all installed
- **THEN** the template is re-registered and available

#### Scenario: Import with missing market packages
- **WHEN** an employee package references market packages not installed on the target Host
- **THEN** the template is registered with an explicit diagnostic per missing reference, grouped by market kind
