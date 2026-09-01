## Purpose

Expose the installed and currently resolvable marketplace assets that an administrator can safely grant to a digital employee template.

## ADDED Requirements

### Requirement: Unified selectable asset catalog
The system SHALL provide an administrator-only catalog containing installed Skills, available registered Tools, and configured MCP clients, with type, name, display metadata, version when available, publisher or source, permission summary, and availability state.

#### Scenario: Load selectable assets
- **WHEN** an administrator opens template configuration
- **THEN** the system returns the assets resolvable by the current Host in deterministic type and display-name order
- **THEN** unavailable, untrusted, disabled, or restart-pending assets are identified and cannot be newly selected

#### Scenario: Preserve existing unresolved references
- **WHEN** an existing draft references an asset that is no longer available
- **THEN** the catalog retains the reference as an unresolved selection with a diagnostic
- **THEN** the administrator can remove or replace it without losing unrelated draft configuration

### Requirement: Selection respects employee authority
The system SHALL restrict selectable Tools, Skills, and MCP clients to assets permitted by the employee root authority, and SHALL constrain expert selections to the parent template authority.

#### Scenario: Reject authority escalation through selection
- **WHEN** an administrator attempts to select an asset or expert capability outside the root employee authority
- **THEN** the system prevents the selection or reports a validation diagnostic
- **THEN** preview and publication remain unavailable until the escalation is removed
