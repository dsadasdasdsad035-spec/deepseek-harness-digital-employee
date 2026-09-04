## MODIFIED Requirements

### Requirement: MCP package trust and archive safety
The system MUST apply the same bounded ZIP, normalized-path, publisher-trust, and atomic-publication protections to MCP client packages as to Tool packages. When the Host configuration explicitly enables unsigned MCP packages, signature and publisher verification are skipped for install and activation while every archive, descriptor, file-table, ownership, atomic-publication, and credential-reference rule still applies.

#### Scenario: Reject an unsafe MCP package
- **WHEN** an MCP client package fails archive, descriptor, or publisher verification
- **THEN** the system returns a structured failure
- **THEN** no candidate package or partial MCP configuration becomes discoverable

#### Scenario: Install an unsigned package under the explicit override
- **WHEN** the Host configuration enables unsigned MCP packages and a descriptor-valid archive is uploaded without a verifiable publisher signature
- **THEN** the system installs it under the same archive, ownership, and credential-reference rules
- **THEN** activation succeeds while the override remains enabled, and fails as untrusted once the override is removed
