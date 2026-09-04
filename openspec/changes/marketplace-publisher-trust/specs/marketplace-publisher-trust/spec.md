## Purpose

Persist and diagnose marketplace publisher trust so a signed Tool or MCP package installs without re-exporting launch-environment JSON on every Host restart.

## ADDED Requirements

### Requirement: Trusted publishers persist in the Harness home
The system SHALL read trusted-publisher records from a Harness-home `market-publishers.json` file whose content is the JSON array of `{ id, publicKeyPem }` records emitted by the publisher toolchain, and SHALL combine those records with trusted publishers supplied by the launching environment for both Tool and MCP marketplace composition.

#### Scenario: Persist one CLI-emitted trust record
- **WHEN** the publisher toolchain prints a trust record and that record is stored as the Harness-home file's JSON array
- **THEN** a subsequent Host composition trusts the signing publisher without any launch-environment variable
- **THEN** installing the corresponding signed package through either marketplace succeeds

#### Scenario: Absent file trusts only configured records
- **WHEN** no Harness-home trusted-publisher file exists
- **THEN** composition proceeds with the launch-environment records only

### Requirement: Invalid trust input fails loud
A present trusted-publisher file that is unreadable, not valid JSON, not an array of unique-id `{ id, publicKeyPem }` records, or group/world-writable MUST fail Tool and MCP marketplace composition with a diagnostic naming the file, and MUST NOT fall back to an empty trust list. The same validation applies to launch-environment records, and a publisher id appearing in both sources MUST fail with the duplicated id.

#### Scenario: Reject a malformed trust file
- **WHEN** the Harness-home file contains invalid JSON or a record without a public key
- **THEN** marketplace composition fails with a diagnostic that names the file path and the invalid record
- **THEN** no package from that Host session installs as trusted

#### Scenario: Reject an ambiguous duplicate publisher id
- **WHEN** the same publisher id is supplied by both the launch environment and the trust file with different public keys
- **THEN** composition fails with the duplicated publisher id

### Requirement: Untrusted-failure diagnostics name the publisher
The marketplace UI SHALL display the descriptor's publisher id when an upload fails publisher verification, in every supported locale, for both Tool and MCP packages.

#### Scenario: Show which publisher identity was rejected
- **WHEN** a Tool or MCP upload fails as untrusted or signature-invalid
- **THEN** the visible error text includes the rejected publisher id
- **THEN** the same failure rendered through the other marketplace tab behaves identically
