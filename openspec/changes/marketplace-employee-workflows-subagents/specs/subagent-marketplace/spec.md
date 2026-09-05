## Purpose

Distribute declarative subagent personas — never provider code — as trusted marketplace packages bound to digital employees.

## ADDED Requirements

### Requirement: Subagent persona declarations are content-safe
The system SHALL accept only declarative persona entries — instructions file, tool allowlist, optional model settings, delegation policy — and MUST reject a subagent package that names or ships executable provider code.

#### Scenario: Persona with a tool allowlist installs
- **WHEN** a persona's tool allowlist names tools available in the target composition
- **THEN** the package installs and the persona becomes bindable

#### Scenario: Persona with an empty instructions file is rejected
- **WHEN** a persona entry's instructions file is missing from the signed file table or is blank
- **THEN** the system rejects the package with a structured failure

### Requirement: Scoped provider registration is instance-isolated
The system SHALL register bound subagent personas as providers visible only within the binding employee's composition, and MUST NOT run or expose them to other compositions.

#### Scenario: Bound persona delegates only for its employee
- **WHEN** an employee with a bound persona delegates to it
- **THEN** the spawn driver composes the child with the persona's instructions and tool allowlist
- **THEN** another employee without the binding cannot address that persona

### Requirement: Delegation policy is enforced
The system SHALL enforce each persona's declared delegation policy — mode, max depth, concurrency, and timeout — on every delegation to it, rejecting over-policy requests with the existing structured capability failures.

#### Scenario: Over-depth delegation is denied
- **WHEN** a delegation to a bound persona exceeds the persona's declared maximum depth
- **THEN** the system denies the delegation with the structured capability failure
