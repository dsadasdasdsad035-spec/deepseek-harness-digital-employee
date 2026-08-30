## Purpose

提供一个完整、确定性的项目经理数字员工参考定义，以便离线验证员工专属 skills、tools、MCP、memory 与项目经理指令能被正确组合和审计。

## ADDED Requirements

### Requirement: Shipped project-manager test employee is discoverable

The system SHALL ship a versioned `project-manager-test` digital employee template with stable display metadata, package-owned `AGENTS.md` instructions, and a project-manager personality suitable for deterministic test workflows.

#### Scenario: Template is loaded

- **WHEN** the digital employee template composition is loaded
- **THEN** `project-manager-test` is available for creating or starting a test employee instance
- **THEN** its declared version, display metadata, and package-owned instructions are resolvable without external services

### Requirement: Employee declares project-management skills and tools

The template SHALL declare project-planning, risk-review, and status-reporting skills, together with explicit project-board and project-document tool capabilities. The employee SHALL not receive undeclared general-purpose capabilities.

#### Scenario: Project planning task starts

- **WHEN** a `project-manager-test` employee starts a project planning task
- **THEN** the resolved Agent composition includes the declared project-management skills and tools
- **THEN** the composition excludes capabilities that are not declared by the employee template

### Requirement: Employee uses a deterministic MCP project data client

The template SHALL declare a package-owned mock MCP client that exposes deterministic project data and requires no network connection or credential value.

#### Scenario: Employee reads project data

- **WHEN** the employee requests project data through its declared MCP client
- **THEN** the client returns the fixture-defined milestone, owner, and risk information
- **THEN** the request is attributable to the employee instance and current Session

### Requirement: Employee memory is seeded and controlled

The test employee SHALL start with bounded project context memory and SHALL be able to propose a durable project decision or preference through the existing controlled long-term memory lifecycle.

#### Scenario: Related project task retrieves seed memory

- **WHEN** a task relates to the fixture project
- **THEN** the employee receives the relevant bounded memory projection in its model-visible context
- **THEN** the Session log identifies the memory records included in that projection

#### Scenario: Employee records a project decision

- **WHEN** the employee proposes a durable project decision through its authorized memory path
- **THEN** the existing memory policy accepts or rejects the candidate with provenance
- **THEN** a later related task can observe an accepted record without exposing another employee's memory

### Requirement: Reference workflow remains deterministic and offline

The project-manager test employee SHALL support an assembled test workflow covering project planning, risk reporting, MCP reads, tool use, and memory retrieval without real model, network, or credential dependencies.

#### Scenario: Assembled reference workflow

- **WHEN** the test harness starts an isolated `project-manager-test` employee and submits the fixture workflow
- **THEN** the observable result identifies the declared skills, tools, MCP client, and relevant memory
- **THEN** the same fixture produces portable output on macOS and Linux without environment-specific normalization
