## MODIFIED Requirements

### Requirement: Memory retrieval is relevant and model-visible

The system SHALL derive a memory retrieval request from the submitted task when starting ordinary employee work, retrieve a bounded projection of relevant employee memory, and log the exact memory records made visible to the model. Callers MAY provide an explicit bounded retrieval request for specialized workflows.

#### Scenario: Employee receives a related task

- **WHEN** long-term memories are relevant to a new task started through the ordinary employee task entry point
- **THEN** the system uses the submitted task as retrieval context without requiring the user or browser to supply memory-query fields
- **THEN** the task receives a bounded attributed projection and the Session log can reconstruct that model input

#### Scenario: No relevant employee memory exists

- **WHEN** an employee task starts and no owned long-term memory matches the bounded retrieval request
- **THEN** the task starts without a fabricated memory projection or memory from another employee

#### Scenario: Specialized caller supplies a bounded retrieval request

- **WHEN** an internal workflow starts employee work with an explicit valid memory retrieval request
- **THEN** the system uses that request instead of deriving one from the submitted task
