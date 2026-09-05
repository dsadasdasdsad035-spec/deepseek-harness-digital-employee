## MODIFIED Requirements

### Requirement: Plugins contribute versioned employee templates
The system SHALL allow plugins to contribute digital employee templates with a stable template ID, version, display metadata, personality defaults, an `AGENTS.md` instruction source, capability references, hook, workflow, and subagent package references, expert definitions, and delegation policy.

#### Scenario: Valid template is registered

- **WHEN** a plugin contributes a complete employee template with unique identity and resolvable references
- **THEN** the template becomes available for employee instance creation

#### Scenario: Invalid template is rejected

- **WHEN** a template omits required metadata, duplicates a live template version, or references a missing required resource
- **THEN** plugin application fails with a diagnostic naming the invalid template and reference

#### Scenario: Template references an uninstalled hook package

- **WHEN** a template's hook references name a hook package that is not installed in the current Host
- **THEN** plugin application fails with a diagnostic naming the missing hook reference

## ADDED Requirements

### Requirement: Workflow and subagent references resolve per employee instance
The system SHALL resolve an employee instance's workflow and subagent bindings — from its instance configuration and template version — against installed packages at composition time, and SHALL reject unresolved workflow or subagent references with a named diagnostic before any Session is created.

#### Scenario: Composition mounts bound workflows and subagents

- **WHEN** an employee instance starts a task whose template binds installed workflow and subagent packages
- **THEN** the composed agent can start those workflows and delegate to those subagent personas for that task

#### Scenario: Unresolved subagent reference blocks task start

- **WHEN** a bound subagent package is no longer installed
- **THEN** task start fails with a diagnostic naming the missing subagent reference
