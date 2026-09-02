## MODIFIED Requirements

### Requirement: Employee capabilities are explicitly authorized

The system SHALL expose only capabilities present in the intersection of the employee template declaration, employee instance authorization, calling Agent's inherited permissions, and, for delegated children, the selected expert or subagent policy.

#### Scenario: Authorized capability is composed

- **WHEN** a skill, tool, or MCP service is declared by the template and authorized for the instance and parent Agent
- **THEN** the employee or expert can use that capability

#### Scenario: Delegated expert receives the capability intersection

- **WHEN** a parent Agent delegates to an expert whose declared capabilities are a subset of the employee and parent grants
- **THEN** the child receives exactly the intersection and cannot access capabilities outside it

#### Scenario: Child requests an unavailable capability

- **WHEN** an expert or subagent requests a capability absent from any authorization layer
- **THEN** the request is rejected and the denied capability is not registered in the child's context

### Requirement: Employee instructions are isolated

The system SHALL compose the employee template's `AGENTS.md`, instance identity, personality overrides, and applicable expert instructions without applying them to unrelated employees or Sessions.

#### Scenario: Two employees use different personalities

- **WHEN** two employee instances start tasks from the same template with different personality overrides
- **THEN** each task receives only its owning employee's resolved instructions

### Requirement: MCP configuration keeps secrets out of templates

The system SHALL allow employee templates to declare MCP client endpoints, launch configuration, and credential references, but SHALL NOT persist credential values in templates, instance exports, Session events, or audit payloads.

#### Scenario: MCP credential is unavailable

- **WHEN** an employee starts work requiring an MCP client whose credential reference cannot be resolved
- **THEN** the required capability fails at the earliest resolvable point with a credential diagnostic

### Requirement: Capability use is attributable

The system SHALL attribute employee skill selection, tool calls, MCP requests, permission denials, delegation requests, child creation, and capability configuration changes to the employee instance, Session, and acting Agent.

#### Scenario: Expert invokes an MCP service

- **WHEN** an expert performs an MCP request
- **THEN** the audit record identifies the employee, expert Agent, Session, service, operation, and outcome without recording secret values
