## ADDED Requirements

### Requirement: Project-manager test employees delegate bounded risk review
The system SHALL expose a Risk Reviewer expert for active `project-manager-test` employees. The expert SHALL use only its declared risk-review instruction, authorized capabilities, and bounded delegation policy, and SHALL not delegate further work.

#### Scenario: Project Manager delegates risk review
- **WHEN** an active project-manager test employee delegates a risk-review task to its Risk Reviewer
- **THEN** the system creates a child expert Session with the expert's declared capabilities and records the delegation

#### Scenario: Risk Reviewer attempts further delegation
- **WHEN** the Risk Reviewer attempts to delegate work to another expert or subagent
- **THEN** the system rejects the request without creating a descendant Session
