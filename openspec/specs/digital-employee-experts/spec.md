# digital-employee-experts Specification

## Purpose

Allow a digital employee to delegate work to named expert Agents and bounded subagents using existing durable Agent orchestration.

## Requirements

### Requirement: Templates declare named experts

The system SHALL allow an employee template to declare experts with stable IDs, responsibilities, instructions, capability allowlists, model settings, memory access, and delegation limits.

#### Scenario: Employee lists available experts

- **WHEN** an employee task requests its expert catalog
- **THEN** only experts enabled by the template and employee instance authorization are returned

### Requirement: Employees delegate tasks to experts

The system SHALL support one-shot and continuable expert delegation, creating a child Session with the resolved expert composition and durable parent relationship.

#### Scenario: One-shot expert completes work

- **WHEN** an employee delegates a task in one-shot mode
- **THEN** the expert result is delivered to the parent task and the delegation is recorded

#### Scenario: Continuable expert receives follow-up

- **WHEN** an employee sends a follow-up to a continuable expert Session
- **THEN** the same expert Session runs another turn with its prior logged context

### Requirement: Nested delegation cannot escalate authority

The system SHALL enforce expert allowlists, maximum depth, concurrency, timeout, and inherited capability restrictions for expert-to-expert and expert-to-subagent delegation.

#### Scenario: Expert exceeds maximum depth

- **WHEN** an expert attempts delegation beyond the employee's configured maximum depth
- **THEN** the delegation is rejected without creating a child Session

#### Scenario: Expert delegates to an unauthorized expert

- **WHEN** an expert selects a target outside its allowed expert set
- **THEN** the request is rejected and an authorization event is recorded

### Requirement: Expert work is observable and controllable

The system SHALL expose expert and subagent relationships, status, interruption, continuation, and terminal results to authorized employee management clients.

#### Scenario: User interrupts an expert subtree

- **WHEN** an authorized user interrupts a running expert and its descendants
- **THEN** cancellation propagates through the subtree and each affected Session records its terminal state

### Requirement: Expert results and memory effects are logged

The system SHALL log expert task inputs, model-visible memory projections, results, and memory promotion decisions so employee work can be restored and audited.

#### Scenario: Parent Session is restored after delegation

- **WHEN** a parent employee Session is restored
- **THEN** it reconstructs the expert result and delegation relationship from durable events

### Requirement: Project-manager test employees delegate bounded risk review

The system SHALL expose a Risk Reviewer expert for active `project-manager-test` employees. The expert SHALL use only its declared risk-review instruction, authorized capabilities, and bounded delegation policy, and SHALL not delegate further work.

#### Scenario: Project Manager delegates risk review

- **WHEN** an active project-manager test employee delegates a risk-review task to its Risk Reviewer
- **THEN** the system creates a child expert Session with the expert's declared capabilities and records the delegation

#### Scenario: Risk Reviewer attempts further delegation

- **WHEN** the Risk Reviewer attempts to delegate work to another expert or subagent
- **THEN** the system rejects the request without creating a descendant Session
