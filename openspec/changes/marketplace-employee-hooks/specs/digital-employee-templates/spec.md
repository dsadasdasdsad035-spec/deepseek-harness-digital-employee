## MODIFIED Requirements

### Requirement: Plugins contribute versioned employee templates
The system SHALL allow plugins to contribute digital employee templates with a stable template ID, version, display metadata, personality defaults, an `AGENTS.md` instruction source, capability references, hook package references, expert definitions, and delegation policy.

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

### Requirement: Hook references resolve per employee instance
The system SHALL resolve an employee instance's hook bindings — from its instance configuration and template version — into mounted hook packages at composition time, and SHALL reject unresolved hook references before creating a task Session.

#### Scenario: Composition resolves template hooks

- **WHEN** an employee instance starts a task from a template whose hook references resolve to installed packages
- **THEN** the composed agent runs those packages' hooks at their declared interception points for that task

#### Scenario: Unresolved hook reference blocks task start

- **WHEN** an employee instance or its template names a hook package that is no longer installed
- **THEN** the system refuses task start with a diagnostic naming the missing hook reference
