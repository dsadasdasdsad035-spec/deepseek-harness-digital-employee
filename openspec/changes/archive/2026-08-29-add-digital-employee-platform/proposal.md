## Why

DeepSeek Harness can compose agents, skills, tools, MCP services, presets, workflows, and subagents, but it does not provide a durable product model that combines those capabilities into reusable digital employee templates and independently evolving employee instances. A digital employee platform is needed so organizations can create persistent, personalized workers with bounded capabilities, memory, expert collaborators, and auditable delegation.

## What Changes

- Add versioned digital employee templates that declare identity, personality, `AGENTS.md`, skills, tools, MCP client references, expert Agents, and delegation policy.
- Allow users to create multiple durable employee instances from one template, with independent names, configuration overrides, authorization, memory, sessions, and lifecycle state.
- Add layered employee memory covering task, session, and long-term scopes, with explicit candidate review, provenance, retrieval, retention, and deletion behavior.
- Add employee-scoped capability resolution so skills, tools, MCP clients, experts, and subagents are limited to the intersection of template declarations, instance authorization, and parent Agent permissions.
- Add expert Agent orchestration using existing Agent and subagent runtimes, including one-shot and continuable delegation, nested scheduling limits, interruption, recovery, and audit records.
- Add employee lifecycle and management surfaces for creation, activation, task execution, template upgrade, export/import, inspection, and deletion.

## Capabilities

### New Capabilities

- `digital-employee-templates`: Defines versioned reusable employee templates and independently persisted employee instances.
- `digital-employee-memory`: Defines task, session, and long-term memory with controlled promotion, retrieval, provenance, and lifecycle behavior.
- `digital-employee-capabilities`: Defines employee-scoped skills, tools, MCP clients, instructions, credentials, and non-escalating authorization.
- `digital-employee-experts`: Defines expert Agent catalogs, delegation, nested Agent scheduling, subagent control, and result delivery.
- `digital-employee-management`: Defines employee lifecycle operations, template upgrades, import/export, task visibility, and audit history.

### Modified Capabilities

- None.

## Impact

The change adds a complete Service Definition / Provider / Consumer capability across new digital employee packages and application bundles. It integrates with existing preset composition, system prompts, skills, tools, credentials, MCP clients, sessions, workflow, subagent providers, settings, and Web management UI. Model-visible employee identity, memory, delegation, and expert results require new session events and matching TypeScript/Python SDK projections. The change must include package, assembled application, keyless snapshot, lifecycle, permission, and recovery coverage.
