## Purpose

Give skill authors a downloadable, working example that demonstrates the ZIP package accepted by the skill marketplace.

## ADDED Requirements

### Requirement: Marketplace provides a downloadable example package

The skill marketplace SHALL expose a download action for a ZIP archive containing a complete example skill package.

#### Scenario: User downloads the example package

- **WHEN** a user selects the marketplace template download action
- **THEN** the browser downloads a ZIP archive with a meaningful filename

### Requirement: Example package demonstrates a valid skill

The downloaded archive SHALL contain a root `SKILL.md` with valid skill name and description metadata, explanatory skill content, and at least one non-executable reference file that illustrates optional package content.

#### Scenario: User inspects the downloaded archive

- **WHEN** the user opens the downloaded ZIP archive
- **THEN** its files show a complete skill definition and an example reference resource without requiring an external build step

### Requirement: Example package is accepted by marketplace installation

The downloaded archive SHALL satisfy the same archive and descriptor validation as a user-uploaded skill ZIP and SHALL install as a new skill into an isolated user skill directory.

#### Scenario: User uploads the downloaded package

- **WHEN** the user uploads the unmodified example ZIP through the skill marketplace
- **THEN** the marketplace installs the example skill successfully and lists it as installed
