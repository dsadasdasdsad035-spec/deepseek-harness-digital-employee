# digital-employee-management Specification

## Purpose

Provide complete creation, operation, upgrade, portability, inspection, and deletion workflows for digital employee instances.

## Requirements

### Requirement: Users manage employee lifecycle

The system SHALL support creating, activating, deactivating, inspecting, and deleting employee instances through typed Host and Web client operations.

#### Scenario: Employee is deactivated

- **WHEN** a user deactivates an employee
- **THEN** the employee accepts no new tasks while existing history and memory remain inspectable

#### Scenario: Employee with active work is deleted

- **WHEN** deletion is confirmed for an employee with running Agents or MCP connections
- **THEN** the system terminates owned work and connections before removing employee state

### Requirement: Template upgrades require explicit review

The system SHALL compare the current and target template versions, report invalid references and requested capability changes, and require explicit authorization for newly requested capabilities before upgrading an instance.

#### Scenario: Upgrade requests a new MCP service

- **WHEN** a target template version adds an MCP service
- **THEN** the upgrade does not authorize that service until the user explicitly approves it

#### Scenario: Upgrade validation fails

- **WHEN** the target template has missing resources or incompatible instance overrides
- **THEN** the current employee version remains active and unchanged

### Requirement: Employee instances are portable without secrets

The system SHALL export and import employee template references, identity and personality overrides, authorization metadata, and optional memory while excluding credential values and non-portable live Session state.

#### Scenario: User exports an employee

- **WHEN** an employee export is requested
- **THEN** the artifact contains no resolved credential values

### Requirement: Management UI exposes operational state

The Web application SHALL provide employee list, employee details, memory, capabilities, experts, task tree, and audit views with actions appropriate to lifecycle state.

#### Scenario: User opens a running employee

- **WHEN** the employee has active expert and subagent work
- **THEN** the details view shows the Agent tree, statuses, and available interruption or continuation actions

### Requirement: User-visible behavior has assembled coverage

The system SHALL cover digital employee creation, task execution, expert delegation, memory promotion, capability denial, and lifecycle transitions through real runnable application composition and keyless snapshots.

#### Scenario: Snapshot harness runs the employee example

- **WHEN** the digital employee example executes without external credentials
- **THEN** the transcript demonstrates the required employee identity, expert delegation, memory decision, and final result
