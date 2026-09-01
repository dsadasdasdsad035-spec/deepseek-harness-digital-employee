## ADDED Requirements

### Requirement: Administrator can publish a template from marketplace examples
The configuration studio SHALL allow an administrator to select the active example Skill, Tool, and MCP server from the catalog, validate the combined authority, publish an immutable template version, and create an active employee from that version.

#### Scenario: Administrator completes the reference template workflow
- **WHEN** all three example assets are active and the administrator selects them in a valid draft
- **THEN** validation succeeds without requiring raw capability identifiers
- **THEN** publication creates a selectable template version containing the three references
- **THEN** employee creation from that version succeeds and the employee can be activated

#### Scenario: One selected example is unavailable
- **WHEN** a draft retains an example asset that is uninstalled, inactive, or outside the selected preset
- **THEN** validation identifies that asset and publication remains unavailable
- **THEN** the administrator can remove the unresolved reference
