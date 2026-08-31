## ADDED Requirements

### Requirement: Project-manager test employees receive isolated seed memory
The system SHALL create the Atlas seed as a non-sensitive long-term memory record when a new `project-manager-test` employee instance is created. The record SHALL be attributed to that instance, and creating or inspecting another employee SHALL not expose or duplicate the record.

#### Scenario: User creates a project-manager test employee
- **WHEN** a user creates a new employee from the `project-manager-test` template
- **THEN** the employee's long-term memory contains the Atlas seed with its package-owned provenance

#### Scenario: Two project-manager test employees are created
- **WHEN** two employees are created from the `project-manager-test` template
- **THEN** each employee receives its own Atlas seed record and neither employee can retrieve the other's memory
