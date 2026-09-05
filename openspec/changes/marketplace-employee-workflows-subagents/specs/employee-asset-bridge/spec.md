## Purpose

Mount bound workflow and subagent packages onto a digital employee's composition with the same instance scoping, resolution, and diagnostics as hook bindings.

## ADDED Requirements

### Requirement: References resolve at composition
The system SHALL resolve an employee's workflow and subagent references — instance configuration plus template — against installed packages at composition time and SHALL reject unresolved references with a named diagnostic before any Session is created.

#### Scenario: Unresolved workflow reference blocks task start
- **WHEN** a bound workflow package is no longer installed
- **THEN** task start fails with a diagnostic naming the missing reference

### Requirement: Mounting is instance-scoped and reversible
The system SHALL mount bound assets on the binding employee's composition only, and SHALL unmount them on unbind without disturbing other employees' bindings.

#### Scenario: Unbind stops exposure without side effects
- **WHEN** an administrator unbinds a workflow or subagent package from an employee
- **THEN** that employee's composition stops exposing the asset and other employees keep theirs

### Requirement: Chat round trip is observable
The system SHALL expose mounted assets through session-observable surfaces — workflow runs through the existing `workflow/*` lifecycle events, subagent delegations through `subagent/start` and `subagent/end` — so the install, bind, and chat-trigger chain is verifiable from the session log.

#### Scenario: Chat-triggered workflow run is recorded
- **WHEN** an employee's model starts a mounted workflow during a chat turn
- **THEN** the session records the workflow lifecycle events for that run
