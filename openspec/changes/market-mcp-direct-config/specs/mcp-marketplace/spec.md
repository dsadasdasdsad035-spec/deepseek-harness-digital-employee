## ADDED Requirements

### Requirement: Inventory spans direct configurations
The system SHALL include user-declared direct MCP configurations in the marketplace MCP inventory with the same entry fields as managed packages (server names, transport, credential requirements, availability, diagnostics), identified as direct rather than packaged.

#### Scenario: List a direct configuration
- **WHEN** a user views the MCP marketplace inventory after saving a direct-config entry
- **THEN** the entry appears with its transport, credential-reference requirements, and live availability
- **THEN** no resolved credential values appear in the inventory response
