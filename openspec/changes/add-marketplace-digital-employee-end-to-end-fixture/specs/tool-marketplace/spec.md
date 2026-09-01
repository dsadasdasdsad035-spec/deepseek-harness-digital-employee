## ADDED Requirements

### Requirement: Marketplace provides an installable development Tool example
The Tool marketplace SHALL provide a downloadable example package with a stable Tool identity, documented input fields, and a valid signature from a publisher that can be trusted explicitly by development and test configurations.

#### Scenario: Development user installs the Tool example
- **WHEN** a development or test Host explicitly trusts the example publisher and a user uploads the unmodified example ZIP
- **THEN** the marketplace installs the package and reports that a Host restart is required before its Tool is active

#### Scenario: Production configuration does not opt into example trust
- **WHEN** a Host uses the production marketplace trust defaults
- **THEN** the example publisher is not trusted merely because the example is distributed with the application

### Requirement: Example Tool activation is restart-bound
The installed example Tool SHALL become selectable only after a restarted Host registers its declared Tool, and invoking it SHALL return a deterministic result derived from its documented input.

#### Scenario: Example Tool is pending activation
- **WHEN** the example package has been installed but the Host has not restarted
- **THEN** its Tool is identified as unavailable and cannot be newly selected for a template

#### Scenario: Example Tool is active
- **WHEN** the Host restarts with the same managed Tool directory
- **THEN** the example Tool is available for template selection
- **THEN** an authorized invocation with valid input returns the documented deterministic response
