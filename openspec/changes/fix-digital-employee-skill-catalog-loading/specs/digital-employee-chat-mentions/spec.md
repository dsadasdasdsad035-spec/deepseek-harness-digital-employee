# digital-employee-chat-mentions Delta

## MODIFIED Requirements

### Requirement: Employee task startup is atomic

The system SHALL create an employee-owned root Session and accept the remaining composer content as its first user message through one task-start operation. The created Session SHALL initialize the employee's resolved capability scope before the first model request, including the model-visible skill catalog.

#### Scenario: Employee task starts successfully

- **WHEN** a user submits a valid employee reference with non-empty task content
- **THEN** the system creates one root Session using that employee's resolved composition, publishes its authorized skill catalog, records the first user message, and returns the new Session identity

#### Scenario: Repeated submission occurs

- **WHEN** the same in-flight submission is triggered repeatedly
- **THEN** the system creates at most one employee-owned root Session for that submission attempt

#### Scenario: Task content is empty

- **WHEN** a user submits an employee reference without task content or supported attachments
- **THEN** the system does not create an employee Session

#### Scenario: The model requests the skill list

- **WHEN** the model needs to discover available skills in an employee-owned Session
- **THEN** the Session provides the current catalog in model-visible prompt context, and the model-facing loader accepts only an exact skill name rather than a `list` pseudo-name

#### Scenario: The employee loads an authorized skill

- **WHEN** the model calls the loader with an exact model-invocable skill name present in the employee's scoped catalog
- **THEN** the loader returns that skill's instructions and records the selection against the employee-owned Agent

#### Scenario: The employee requests an unauthorized skill

- **WHEN** the model calls the loader with a skill name absent from the employee's scoped catalog
- **THEN** the loader returns an unavailable-skill diagnostic and does not broaden the employee's authorization
