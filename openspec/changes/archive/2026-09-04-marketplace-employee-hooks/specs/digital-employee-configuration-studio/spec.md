## ADDED Requirements

### Requirement: Administrator manages hook bindings on employees

The system SHALL let the local administrator view installed hook packages with their event bindings, invocability, and credential-reference requirements, and bind or unbind hook packages on a digital employee instance or draft from the configuration studio.

#### Scenario: Administrator binds an installed hook

- **WHEN** the administrator binds an installed hook package to an employee draft and saves
- **THEN** the draft records the hook reference without persisting resolved credential values

#### Scenario: Validation reports an unresolved hook reference

- **WHEN** a draft binds a hook package that is not installed, or a hook's credential reference is unconfigured
- **THEN** validation reports the named unresolved reference and rejects preview and publishing
