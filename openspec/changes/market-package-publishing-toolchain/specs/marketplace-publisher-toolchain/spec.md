## Purpose

Give Tool and MCP package publishers a supported path from a source directory to a signed archive that the corresponding marketplace installs, without weakening explicit publisher trust.

## ADDED Requirements

### Requirement: Build an installable signed package from a source directory
The publisher toolchain SHALL assemble a marketplace ZIP from a source directory containing a package descriptor, compute the descriptor's declared file table from the actual file bytes, sign the descriptor with the supplied publisher key, and write the resulting archive to a caller-chosen path.

#### Scenario: Build a Tool package
- **WHEN** a publisher runs the toolchain over a source directory containing a valid Tool descriptor and its declared files
- **THEN** the output ZIP contains the descriptor with the computed file hashes and a real publisher signature
- **THEN** installing that ZIP through the Tool marketplace with the matching trusted publisher succeeds

#### Scenario: Build an MCP package
- **WHEN** a publisher runs the toolchain over a source directory containing a valid MCP descriptor and its declared files
- **THEN** the output ZIP installs through the MCP marketplace with the matching trusted publisher and preserves credential-reference-only headers

### Requirement: Signature covers exactly the installed descriptor
The signed bytes produced by the toolchain MUST be the same canonical descriptor payload that marketplace installation verifies, so a package accepted by the toolchain is never rejected for signature-serialization drift.

#### Scenario: Round-trip a produced package
- **WHEN** a package built by the toolchain is installed by a marketplace whose trusted-publishers configuration contains the signing publisher
- **THEN** descriptor, file-table, and signature verification all pass without re-signing or editing the archive

### Requirement: Publisher key generation emits the matching trust record
The toolchain SHALL accept an existing Ed25519 private key or generate a new keypair on request, and SHALL output the public-key trust record in the form the Host's trusted-publishers configuration consumes. Private key material MUST NOT appear in the produced archive or trust record.

#### Scenario: Generate a local publisher identity
- **WHEN** a publisher requests key generation
- **THEN** the toolchain reports the private key only through the requested key output and reports the corresponding trusted-publisher record separately
- **THEN** configuring that record in the Host and installing the signed package succeeds

### Requirement: Invalid package sources fail before publication
The toolchain MUST reject a source directory whose descriptor is missing or invalid, whose supplied publisher identity is still a placeholder, whose declared files do not match the directory, or which contains unsafe entries such as absolute paths, path traversal, or symbolic links, and MUST report a specific failure without writing a partial archive. Source descriptor signature values are always replaced by the toolchain's own signature and are never trusted as input.

#### Scenario: Reject an unmodified downloaded template
- **WHEN** the toolchain runs over a Tool or MCP publisher template without supplying a real publisher identity, leaving the shipped placeholder in effect
- **THEN** it fails with a message identifying the placeholder publisher identity
- **THEN** no archive is written

#### Scenario: Reject a descriptor/file-table mismatch
- **WHEN** a source directory omits a file declared by its descriptor or contains an undeclared extra file
- **THEN** the toolchain fails without producing an archive

### Requirement: Signed templates complete the marketplace round trip
The Tool and MCP publisher templates distributed by the Web UI SHALL become installable packages when processed by the toolchain with a trusted publisher key, and their download actions SHALL identify them as publisher templates that require signing rather than installable examples.

#### Scenario: Round-trip a downloaded Tool template
- **WHEN** a user downloads the Tool publisher template, signs it with the toolchain using a generated publisher key, configures the emitted trust record, and uploads the result
- **THEN** the Tool marketplace installs it and reports the restart requirement

#### Scenario: Template labeling states the signing prerequisite
- **WHEN** a user views the Tool or MCP marketplace download action
- **THEN** its label identifies the archive as a publisher template in every supported locale, while the skill marketplace continues to label its archive as an example ZIP
