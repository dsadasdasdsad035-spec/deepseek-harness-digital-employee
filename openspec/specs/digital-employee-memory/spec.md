# digital-employee-memory Specification

## Purpose

Provide bounded, attributable memory that lets each digital employee retain useful experience without automatically preserving every conversation.

## Requirements

### Requirement: Employee memory is separated by scope

The system SHALL distinguish task memory, Session memory, and employee long-term memory and SHALL associate every memory record with its owning employee and source.

#### Scenario: Expert creates intermediate task state

- **WHEN** an expert Agent records intermediate material for its delegated task
- **THEN** the material remains in task scope unless a permitted promotion creates a broader memory record

#### Scenario: Session is resumed

- **WHEN** an employee Session is restored
- **THEN** its Session memory is reconstructed without exposing another employee's memory

### Requirement: Long-term memory uses controlled promotion

The system SHALL require long-term memory writes to pass a policy that records provenance, removes duplicates, enforces retention and sensitivity rules, and either accepts or rejects the candidate.

#### Scenario: Agent proposes durable experience

- **WHEN** an employee or expert submits a long-term memory candidate
- **THEN** the policy records an accepted memory or a logged rejection rather than automatically persisting the source text

### Requirement: Memory retrieval is relevant and model-visible

The system SHALL retrieve a bounded projection of relevant employee memory for a task and SHALL log the exact memory records made visible to the model.

#### Scenario: Employee receives a related task

- **WHEN** long-term memories are relevant to a new task
- **THEN** the task receives a bounded attributed projection and the Session log can reconstruct that model input

### Requirement: Memory lifecycle follows employee ownership

The system SHALL support inspecting and deleting employee long-term memories, and deleting an employee SHALL remove its long-term memory records and indexes after active work is terminated.

#### Scenario: Employee is deleted

- **WHEN** deletion completes for an employee
- **THEN** subsequent memory queries cannot retrieve records owned by that employee
