## MODIFIED Requirements

### Requirement: Tool package trust and archive safety
The system MUST reject an invalid signature, untrusted publisher, malformed or unsafe ZIP archive, path traversal, symbolic link, duplicate normalized path, unsupported entry type, invalid manifest, or package exceeding declared resource limits, unless the Host configuration explicitly enables unsigned Tool packages, in which case signature and publisher verification are skipped for install and restart-time activation while every archive, descriptor, file-table, ownership, and atomic-publication rule still applies.

#### Scenario: Reject an unsafe Tool upload
- **WHEN** a Tool package fails archive, descriptor, or publisher verification
- **THEN** the system returns a structured actionable failure without exposing an absolute Host path
- **THEN** no candidate files become visible in the configured Tool directory

#### Scenario: Reject untrusted executable content
- **WHEN** a Tool package contains executable content from a publisher not trusted by the local marketplace configuration
- **THEN** the system refuses installation
- **THEN** it does not load or evaluate package content in the running Host

#### Scenario: Install an unsigned package under the explicit override
- **WHEN** the Host configuration enables unsigned Tool packages and a descriptor-valid archive is uploaded without a verifiable publisher signature
- **THEN** the system installs it under the same archive, file-table, ownership, and atomicity rules
- **THEN** restart-time activation succeeds while the override remains enabled, and fails as untrusted once the override is removed
