## MODIFIED Requirements

### Requirement: Managed installation inventory

The system SHALL list marketplace-managed Skills from the target Harness home’s configured Skill directory when the suite bundle is installed, while leaving hand-managed Skills discoverable by the normal Skill provider and outside marketplace mutation authority.

#### Scenario: Suite reads target Skill directory

- **WHEN** a suite Host lists marketplace Skills
- **THEN** it reports managed installations from the target Harness home
- **THEN** it does not show Skills from the bundle author’s machine
