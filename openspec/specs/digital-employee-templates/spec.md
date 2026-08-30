# digital-employee-templates Specification

## Purpose

Define reusable, versioned digital employee templates and durable employee instances that preserve independent identity and state.

## Requirements

### Requirement: Plugins contribute versioned employee templates

The system SHALL allow plugins to contribute digital employee templates with a stable template ID, version, display metadata, personality defaults, an `AGENTS.md` instruction source, capability references, expert definitions, and delegation policy.

#### Scenario: Valid template is registered

- **WHEN** a plugin contributes a complete employee template with unique identity and resolvable references
- **THEN** the template becomes available for employee instance creation

#### Scenario: Invalid template is rejected

- **WHEN** a template omits required metadata, duplicates a live template version, or references a missing required resource
- **THEN** plugin application fails with a diagnostic naming the invalid template and reference

### Requirement: Users create independent instances from one template

The system SHALL allow multiple employee instances to reference the same template while retaining independent stable IDs, display names, personality overrides, authorization, memory, sessions, and lifecycle state.

#### Scenario: Two instances use one template

- **WHEN** a user creates two employees from the same template
- **THEN** changes to one instance's name, memory, authorization, or sessions do not alter the other instance

### Requirement: Runtime composition is resolved explicitly

The system SHALL resolve an employee instance and template version into a complete Agent composition before task execution and SHALL reject unresolved template versions or references before creating a task Session.

#### Scenario: Employee starts a task

- **WHEN** an active employee with a valid template version receives a task
- **THEN** the task Agent receives the resolved identity, personality, instructions, skills, tools, MCP clients, expert catalog, and delegation limits

#### Scenario: Referenced template version is unavailable

- **WHEN** an employee references a template version that is not installed
- **THEN** task creation fails without silently selecting another version
