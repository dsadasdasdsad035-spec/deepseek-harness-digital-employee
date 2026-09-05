# employee-hook-bridge Specification

## Purpose
Mount installed hook packages onto an employee's composition and execute them through the shared hook protocol, including the chat-window invocation path for invocable hooks.

## Requirements

### Requirement: Instance-scoped hook mounting
The system SHALL mount the hook packages an employee instance binds — directly or through its template — on that instance's composition only, and SHALL NOT run instance-bound hooks for other compositions or globally.

#### Scenario: Bound hooks intercept only their employee
- **WHEN** an employee instance binds a hook package and starts a task
- **THEN** the bound hooks run at their declared interception points within that employee's sessions
- **THEN** another employee without the binding runs no hook commands from that package

#### Scenario: Unmount on unbind
- **WHEN** an administrator unbinds a hook package from an employee instance
- **THEN** the package's hooks stop intercepting that employee's sessions without disposing other employees' bindings

### Requirement: Protocol-conformant execution and records
The system SHALL execute bound hooks through the shared hook protocol runner — stdin payload, matcher filtering, timeout, credential-scrubbed environment — and SHALL record `hook/invoked` and `hook/result` session events for every run inside an open turn.

#### Scenario: A PreToolUse binding runs and records
- **WHEN** a bound hook matches a tool call at the PreToolUse point
- **THEN** the system runs the hook command with the event payload and merges its output per the shared merge rules
- **THEN** the session log contains the paired invocation and result records

### Requirement: Chat invocation of invocable hooks
The system SHALL let an employee's agent invoke a bound invocable hook as a tool during a chat turn, returning the hook command's stdout as the tool result, and SHALL reject invocation of hooks that are not bound to that employee or not declared invocable.

#### Scenario: Employee triggers a test hook from chat
- **WHEN** an employee's agent calls the tool of a bound invocable test hook during a chat turn
- **THEN** the system runs the hook command with the tool input and the tool result contains the hook's stdout
- **THEN** the run produces invocation and result session records like any hook execution

#### Scenario: Invocation of an unbound or passive hook fails
- **WHEN** an agent calls the tool of a hook its employee has not bound, or of a non-invocable hook
- **THEN** the system fails the call with a structured error and runs no command
