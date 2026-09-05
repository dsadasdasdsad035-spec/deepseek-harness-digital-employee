## ADDED Requirements

### Requirement: Employee package format and signing
The system SHALL export any published local template as a signed `employee-package.json` zip containing the template metadata, instruction and expert files, and a references manifest naming required market packages, verifying signatures with the marketplace trust machinery.

#### Scenario: Export a published template
- **WHEN** an administrator exports a published template
- **THEN** a signed zip is produced containing the template metadata, files, and references manifest

### Requirement: Import validates references before registration
The system SHALL validate an imported employee package's signature and references manifest, re-register the template, and report every market package reference missing from the target Host as a grouped diagnostic.

#### Scenario: Import with satisfied references
- **WHEN** an employee package whose references are all installed is imported
- **THEN** the template is re-registered and available for employee creation

#### Scenario: Import with missing market packages
- **WHEN** an employee package references market packages not installed on the target Host
- **THEN** the template is registered with an explicit diagnostic per missing reference, grouped by market kind
