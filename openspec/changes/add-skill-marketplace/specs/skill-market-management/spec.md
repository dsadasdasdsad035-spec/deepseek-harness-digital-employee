## Purpose

Provide a durable Host authority for inspecting and safely mutating marketplace-managed skill installations without granting browser code direct filesystem access or ownership over hand-managed skills.

## ADDED Requirements

### Requirement: Trusted marketplace operations
The system SHALL expose typed Host operations for listing marketplace installations, installing an uploaded archive, reading a promotional image, and uninstalling an installation. Expected business failures SHALL use a structured, discriminated result that preserves machine-readable error codes and details without requiring clients to parse message text.

#### Scenario: Expected validation failure
- **WHEN** a client submits an archive that violates a declared marketplace rule
- **THEN** the Host returns a typed failure containing the applicable error code and details
- **THEN** the response does not expose an absolute Host filesystem path

#### Scenario: Unexpected Host failure
- **WHEN** an operation fails for a reason outside the declared business failures
- **THEN** the trusted API carrier reports an infrastructure failure without converting it into a misleading validation result

### Requirement: Managed installation inventory
The system SHALL list only skill directories carrying a supported marketplace management manifest and SHALL return their name, description, optional version, optional author, optional tags, installation timestamp, and promotional-image availability in deterministic name order.

#### Scenario: Mixed managed and hand-managed directories
- **WHEN** the user skill directory contains supported marketplace installations, hand-managed skills, unrelated entries, and incompatible marketplace manifests
- **THEN** the marketplace inventory contains only the supported marketplace installations
- **THEN** the hand-managed, unrelated, and incompatible entries remain untouched

#### Scenario: Missing user skill directory
- **WHEN** the configured user skill directory does not exist
- **THEN** the marketplace inventory is empty

### Requirement: Bounded hostile archive validation
The system MUST treat uploaded data as hostile and MUST reject malformed base64, non-ZIP data, archives larger than 10 MiB after decoding, archives with more than 256 file entries, any entry larger than 30 MiB after extraction, or archives larger than 30 MiB in total after extraction. The limits MUST be enforced while decoding entries so a high-compression-ratio archive cannot require unbounded memory or disk space.

#### Scenario: Archive exceeds a resource limit
- **WHEN** an upload exceeds the encoded archive, file count, per-entry, or total extracted-byte limit
- **THEN** validation stops with a structured limit failure identifying the violated limit
- **THEN** no skill installation becomes visible in the user skill directory

#### Scenario: Malformed encoded upload
- **WHEN** the upload is not strict base64 or does not contain a valid ZIP archive
- **THEN** the Host rejects it as an invalid archive
- **THEN** no staging content remains after the operation settles

### Requirement: Safe archive entries and layout
The system MUST accept only regular file entries whose normalized relative paths stay inside one skill bundle. It MUST reject absolute paths, traversal segments, ambiguous separators, NUL bytes, duplicate normalized paths, symbolic links, device-like or other unsupported entry types, and archives that mix root files with an enclosing skill directory.

#### Scenario: Unsafe archive path
- **WHEN** any ZIP entry resolves outside the candidate skill directory or aliases another entry after normalization
- **THEN** the Host rejects the entire upload as unsafe
- **THEN** no archive entry is written outside private staging

#### Scenario: Supported root layout
- **WHEN** an archive contains either one skill directly at its root or one enclosing directory containing that skill
- **THEN** the Host evaluates the enclosed `SKILL.md` and files as one candidate bundle

#### Scenario: Ambiguous root layout
- **WHEN** an archive contains multiple candidate roots or mixes root files with an enclosing directory
- **THEN** the Host rejects the archive without selecting one candidate heuristically

### Requirement: Skill descriptor validation
Every accepted bundle MUST contain exactly one root `SKILL.md` with valid frontmatter. The descriptor MUST declare a kebab-case `name` and a non-empty `description`; optional marketplace metadata MAY declare a version, author, tags, and promotional-image path, and every declared field MUST satisfy bounded type and length rules.

#### Scenario: Valid descriptor
- **WHEN** the candidate bundle has a valid `SKILL.md` and valid optional marketplace metadata
- **THEN** the Host derives the installation name and marketplace inventory fields from that descriptor

#### Scenario: Invalid descriptor
- **WHEN** `SKILL.md` is missing, duplicated, malformed, names an invalid skill, or contains invalid marketplace metadata
- **THEN** the Host rejects the upload with a structured descriptor failure

### Requirement: Promotional image safety
The system SHALL support bounded PNG, JPEG, WebP, and GIF promotional images declared relative to the skill directory. It MUST reject traversal, unsupported media, signature and declared-type mismatches, missing files, and images larger than 2 MiB, and SHALL deliver accepted bytes with a validated media type.

#### Scenario: Valid promotional image
- **WHEN** a managed skill declares an existing supported promotional image of at most 2 MiB
- **THEN** the inventory marks the image as available
- **THEN** an image read returns its validated media type and bounded encoded bytes

#### Scenario: Invalid promotional image during install
- **WHEN** marketplace metadata declares an unsafe, missing, oversized, unsupported, or signature-mismatched image
- **THEN** the Host rejects the entire archive
- **THEN** no installation is published

### Requirement: Marketplace ownership and atomic installation
The system SHALL write a versioned management manifest inside every successful marketplace installation. A new installation MUST NOT replace any existing same-name directory. An upgrade MUST require explicit replacement intent and MUST replace only an installation carrying a supported matching management manifest.

#### Scenario: New installation
- **WHEN** a valid archive names a skill whose target directory does not exist
- **THEN** the Host publishes the complete skill and its management manifest atomically
- **THEN** readers never observe a partially extracted target directory

#### Scenario: Managed upgrade requires confirmation
- **WHEN** a valid archive names an existing supported marketplace installation and replacement intent is absent
- **THEN** the Host returns a structured managed-conflict result suitable for an upgrade confirmation
- **THEN** the existing installation remains unchanged

#### Scenario: Confirmed managed upgrade
- **WHEN** replacement intent is explicit and the existing target carries a supported matching management manifest
- **THEN** the Host atomically replaces the old installation with the new bundle
- **THEN** a commit failure restores the complete old installation

#### Scenario: Unmanaged same-name conflict
- **WHEN** the target directory exists without a supported matching management manifest
- **THEN** the Host refuses replacement even when replacement intent is explicit
- **THEN** the existing directory remains unchanged

### Requirement: Serialized mutation lifecycle
Mutating operations for the same skill name MUST execute serially from final conflict validation through commit or rollback, while mutations for different skill names MAY proceed independently.

#### Scenario: Concurrent same-name mutations
- **WHEN** install, upgrade, or uninstall requests overlap for the same skill name
- **THEN** each request evaluates ownership and target state after the preceding mutation settles
- **THEN** the resulting installation corresponds to a complete successful operation rather than an interleaving of requests

### Requirement: Managed-only uninstall
The system SHALL uninstall only a skill whose target directory carries a supported management manifest matching the requested skill name. Successful uninstall SHALL first detach the complete directory from its public target path before asynchronous cleanup.

#### Scenario: Uninstall managed skill
- **WHEN** the user confirms uninstall of a supported marketplace installation
- **THEN** the complete target directory ceases to be discoverable as one operation
- **THEN** the Host reports successful removal

#### Scenario: Refuse unmanaged uninstall
- **WHEN** the requested target is absent, hand-managed, manifest-incompatible, or has a mismatched manifest name
- **THEN** the Host returns a structured not-found or not-managed failure
- **THEN** it does not remove the target

### Requirement: Skill discovery refresh
After a successful install, upgrade, or uninstall, the system SHALL notify the existing filesystem skill provider through its owned invalidation mechanism so subsequent catalog observations use the committed filesystem state. Failed and rolled-back mutations MUST NOT announce a successful catalog change.

#### Scenario: Successful mutation refreshes discovery
- **WHEN** a marketplace mutation commits successfully
- **THEN** a subsequent skill catalog observation can discover the new committed state without restarting the Host

#### Scenario: Failed mutation preserves discovery
- **WHEN** validation, commit, or rollback causes the marketplace operation to fail
- **THEN** the marketplace does not announce the rejected candidate as installed
