# digital-employee-memory Delta

## ADDED Requirements

### Requirement: Employee memory is model-writable through a composition tool

Employee composition SHALL mount one memory tool for every employee Agent with two actions: `save` SHALL submit a long-term memory candidate through the controlled-promotion policy, and `search` SHALL return a bounded result of employee-owned memories. The tool SHALL attribute candidates to the employee and current session, and every accepted or rejected decision SHALL be recorded in the owning Session log. The tool SHALL remain model-visible even when business tools are restricted.

#### Scenario: Employee saves an experience during chat

- **WHEN** the model invokes the memory tool with a `save` candidate containing content and tags
- **THEN** the controlled-promotion policy decides the candidate and the Session log records the exact accepted or rejected decision with provenance

#### Scenario: Promotion policy rejects a candidate

- **WHEN** the model submits a candidate that duplicates existing long-term content, is sensitive while sensitive promotion is disabled, or requests retention beyond the maximum
- **THEN** the tool returns the policy rejection to the model and persists no memory

#### Scenario: Employee searches its own memories

- **WHEN** the model invokes the memory tool with a `search` text and limit
- **THEN** the tool returns only that employee's memories under the same scoring and bound as task projection, and never another employee's records

## MODIFIED Requirements

### Requirement: Memory retrieval is relevant and model-visible

The system SHALL retrieve a bounded projection of relevant employee memory for a task and SHALL log the exact memory records made visible to the model. Live chat entries SHALL supply the bounded query at task creation: the 1:1 chat entry and each group member session SHALL project the employee's most recent long-term memories up to a configured bound, and a cold-resumed group member session SHALL receive the same bounded projection on resume.

#### Scenario: Employee receives a related task

- **WHEN** long-term memories are relevant to a new task
- **THEN** the task receives a bounded attributed projection and the Session log can reconstruct that model input

#### Scenario: Employee starts a 1:1 chat with stored memories

- **WHEN** the 1:1 chat entry creates a task session for an employee with long-term memories
- **THEN** the session prompt includes the bounded most-recent projection and the Session log records the exact projected records

#### Scenario: Group member session is cold-resumed with stored memories

- **WHEN** a group member session is restored after a restart and its next turn runs
- **THEN** the resumed session re-projects the bounded most-recent long-term memories before the turn executes
