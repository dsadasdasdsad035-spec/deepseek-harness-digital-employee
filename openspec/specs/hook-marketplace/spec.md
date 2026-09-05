# hook-marketplace Specification

## Purpose
Distribute agent lifecycle hooks as trusted marketplace packages, sharing the tool/mcp package machinery, so administrators and templates can acquire interception behavior without hand-editing host configuration.

## Requirements

### Requirement: Hook package lifecycle and trust
The system SHALL install, upgrade, and uninstall hook packages with the same bounded-ZIP, normalized-path, publisher-trust, file-table, and atomic-publication protections as Tool and MCP packages, from a `hook-package.json` descriptor declaring command hooks bound to interception events.

#### Scenario: Install a signed hook package
- **WHEN** a user uploads a valid trusted hook package
- **THEN** the system publishes the managed package atomically in the configured user directory
- **THEN** the package's declared hooks become available for binding after any required restart

#### Scenario: Reject an unsafe hook package
- **WHEN** a hook package fails archive, descriptor, or publisher verification
- **THEN** the system returns a structured failure and no candidate hooks become discoverable

### Requirement: Hook descriptor validation
The system SHALL validate that every declared hook binds to a supported interception event, names a bare interpreter command within the Host allowlist, keeps slash-containing arguments inside the signed file table, and carries valid event matchers, rejecting the package with a structured diagnostic otherwise.

#### Scenario: Descriptor binds an unsupported event
- **WHEN** a hook entry names an event the interception surface does not provide
- **THEN** the system rejects the package naming the unsupported event

#### Scenario: Descriptor uses a non-allowlisted interpreter
- **WHEN** a hook command is outside the configured interpreter allowlist
- **THEN** the system rejects the package with a structured interpreter failure

### Requirement: Local-execution disclosure for hook packages
The system MUST require the explicit local-execution confirmation before installing or upgrading any hook package, and any credential-backed environment slot must follow the empty-fixed-value reference rule.

#### Scenario: Install without confirmation
- **WHEN** an install request for a hook package omits the local-execution confirmation
- **THEN** the system refuses the installation with the structured confirmation-required failure and starts no subprocess

### Requirement: Invocable hooks register a model-facing tool
The system SHALL additionally register a model-facing tool for every hook declared `invocable`, named after the hook and returning the hook command's stdout as the tool result, so a chat participant can trigger the hook on demand.

#### Scenario: Installed invocable hook becomes callable
- **WHEN** an invocable hook package finishes installation and the Host composition mounts it
- **THEN** the registered tool runs the hook command with the supplied input and returns its stdout

#### Scenario: Non-invocable hooks register no tool
- **WHEN** a hook package declares only passive event bindings
- **THEN** installation registers no model-facing tool for those hooks
