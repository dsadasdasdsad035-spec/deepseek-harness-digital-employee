# Digital Employee Configuration Studio Design

English | [中文](2026-08-31-digital-employee-configuration-studio-design.zh.md)

## Purpose

Add a local administrator configuration studio to the existing digital employee management surface.

Ordinary users continue to create, use, and upgrade employee instances from the employee workspace.

Administrators create and publish immutable employee template versions from the configuration studio.

## Product Areas

The existing employee workspace remains responsible for employee instance lifecycle, employee chat, memory inspection, expert task inspection, audits, import/export, and template upgrades.

The configuration studio adds template drafts, validation, preview, version history, and publishing.

The studio is visible only to the local administrator in the first release.

## Template Draft

Each draft includes:

- Basic information: name, identifier, description, promotional image, and suggested use cases.
- Main agent configuration: `AGENT.md`, behavior, model selection, working directory, approval policy, and default capability set.
- Expert agent configuration: expert instructions, permitted skills, tools, MCP clients, memory access, and delegation limits.
- Skills: references to installed or marketplace-provided skills.
- Tools: explicit permitted tools with their documented inputs, results, and approval implications.
- MCP clients: references to registered configurations without browser-stored credentials.
- Memory: employee-creation seed memories and long-term memory policy.

## Lifecycle

The administrator works through:

`draft -> validation -> sandbox preview -> published version`

Publishing creates an immutable version.

Editing a published version starts a new draft.

Employee instances retain their current template version until an administrator or user applies an available upgrade through the existing upgrade workflow.

## Validation And Preview

Validation rejects incomplete or unsafe configurations, including:

- Duplicate MCP server names.
- Missing skill, tool, or MCP references.
- Expert permissions exceeding the parent agent permissions.
- Unsupported expert delegation depth.
- Invalid template identifiers.
- Missing required agent instructions.
- Sensitive MCP credentials embedded in a draft.

Preview creates an isolated temporary employee instance and session.

Preview data does not change published templates, employee instances, or durable employee memories.

## First Release Limits

The first release is local and single-administrator only.

It does not add authentication, organizations, collaborative editing, approval workflows, or browser-based secret management.

Marketplace ZIP packages remain a source for skills and templates, but are not the template-editing representation.
