## ADDED Requirements

### Requirement: Project-manager test template demonstrates memory and expert composition
The system SHALL publish the `project-manager-test` template with its existing project-management capabilities, the Risk Reviewer expert, and a delegation policy that permits only the root employee to invoke that expert.

#### Scenario: User inspects the project-manager test template
- **WHEN** a management client lists the registered `project-manager-test` template
- **THEN** the returned template identifies the Risk Reviewer expert and the root employee's authority to delegate to it
