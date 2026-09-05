## Purpose

Distribute workflow orchestration scripts and declarative subagent personas as trusted marketplace packages, mounted per digital employee, so chat tasks can run acquired workflows and delegate to acquired subagents.

## ADDED Requirements

### Requirement: Workflow package lifecycle and trust
The system SHALL install, upgrade, and uninstall workflow packages with the same bounded-ZIP, normalized-path, publisher-trust, file-table, and atomic-publication protections as other package kinds, from a `workflow-package.json` descriptor whose entries name script files inside the signed file table.

#### Scenario: Install a signed workflow package
- **WHEN** a user uploads a valid trusted workflow package
- **THEN** the system publishes the managed package atomically and the declared workflows become available for binding after any required restart

#### Scenario: Reject an unsafe workflow package
- **WHEN** a workflow package fails archive, descriptor, or publisher verification
- **THEN** the system returns a structured failure and no candidate workflows become discoverable

### Requirement: Workflow packages execute local code
The system MUST require the explicit local-execution confirmation before installing or upgrading any workflow package, and workflow script commands MUST stay within the Host interpreter allowlist.

#### Scenario: Install without confirmation
- **WHEN** an install request omits the local-execution confirmation
- **THEN** the system refuses the installation and starts no subprocess

### Requirement: Declarative subagent package lifecycle
The system SHALL install, upgrade, and uninstall subagent packages whose entries declare child personas — instructions file, tool allowlist, optional model settings, and delegation policy — inside the signed file table, with publisher trust, the interpreter allowlist, and the explicit local-execution confirmation applied like other executable kinds.

#### Scenario: Install a declarative subagent package
- **WHEN** a user uploads a valid trusted subagent package
- **THEN** the declared personas become available for binding after any required restart

#### Scenario: Reject an executable provider payload
- **WHEN** a subagent package attempts to ship or name executable provider code rather than a declarative persona
- **THEN** the system rejects the package with a structured failure

### Requirement: Mounted workflows and subagents register model-facing surfaces
The system SHALL register every mounted workflow on the workflow engine and every mounted subagent persona as a `subagent__<id>` delegation provider backed by the fixed in-process spawn driver, so an employee's model can start the workflow and delegate to the persona during chat.

#### Scenario: Bound workflow starts from chat
- **WHEN** an employee's model starts a mounted workflow during a chat turn
- **THEN** the workflow engine executes the package's script and the run follows the existing workflow lifecycle events

#### Scenario: Bound subagent receives delegation
- **WHEN** an employee's model delegates to a mounted `subagent__<id>` persona
- **THEN** the in-process spawn driver composes the child with the persona's instructions, tool allowlist, and delegation policy

### Requirement: Marketplace inventory covers both kinds
The system SHALL list managed workflow and subagent packages with identity, display metadata, version, publisher, entry summaries, permissions, credential requirements where declared, availability, and diagnostics, omitting resolved credential values.

#### Scenario: List installed workflow and subagent packages
- **WHEN** a user views the marketplace inventory
- **THEN** installed workflow and subagent packages appear with their entry summaries and availability
