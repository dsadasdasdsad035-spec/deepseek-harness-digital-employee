## ADDED Requirements

### Requirement: Administrator manages workflow and subagent bindings

The system SHALL let the local administrator view installed workflow and subagent packages with entry summaries, permissions, and credential requirements, and bind or unbind them on a digital employee instance or draft from the configuration studio.

#### Scenario: Administrator binds a workflow package

- **WHEN** the administrator binds an installed workflow package to an employee draft and saves
- **THEN** the draft records the workflow reference without persisting resolved credential values

#### Scenario: Validation reports unresolved asset references

- **WHEN** a draft binds a workflow or subagent package that is not installed
- **THEN** validation reports the named unresolved reference and rejects preview and publishing
