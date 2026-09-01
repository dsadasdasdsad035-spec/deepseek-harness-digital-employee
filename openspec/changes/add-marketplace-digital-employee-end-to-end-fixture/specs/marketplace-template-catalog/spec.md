## ADDED Requirements

### Requirement: Catalog projects activated marketplace examples consistently
The template catalog SHALL correlate each installed example package with its active runtime Skill, Tool, or MCP client and expose its marketplace provenance, version, publisher, availability, and restart status.

#### Scenario: Host has restarted after all examples were installed
- **WHEN** Template configuration loads after the Host restarts with the same marketplace state
- **THEN** the example Skill, Tool, and MCP server are each shown as available and selectable
- **THEN** their marketplace metadata is presented with their runtime identity

#### Scenario: Installed example has not activated
- **WHEN** an example is installed but its runtime capability is absent from the selected preset or current Host
- **THEN** the catalog shows the installed asset as unavailable with an activation or restart diagnostic
- **THEN** the asset cannot be newly selected
