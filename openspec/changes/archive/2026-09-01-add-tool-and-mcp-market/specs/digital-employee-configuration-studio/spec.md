## ADDED Requirements

### Requirement: Template capability selectors
The administrator template editor SHALL provide searchable multi-select controls backed by the marketplace template catalog for Skills, Tools, and MCP clients, rather than requiring the administrator to type those identifiers as raw JSON.

#### Scenario: Select installed assets for a draft
- **WHEN** an administrator selects installed Skills, available Tools, and configured MCP clients in the template editor
- **THEN** the draft records the selected capability references and MCP client declarations
- **THEN** the editor presents each selected item's source and permission summary

#### Scenario: No matching selectable asset
- **WHEN** the administrator searches for an asset absent from the current catalog
- **THEN** the editor presents a distinct empty result
- **THEN** it does not create an arbitrary unresolved identifier

### Requirement: Advanced configuration remains explicit
The administrator template editor SHALL retain explicit advanced editors for expert Agents, long-term memory seeds, and delegation policy, while capability selection remains separate from those JSON values.

#### Scenario: Preserve advanced draft configuration
- **WHEN** an administrator changes capability selections
- **THEN** existing expert, memory-seed, and delegation configuration remains unchanged unless the administrator edits it
- **THEN** validation identifies any authority mismatch introduced by the combined configuration
