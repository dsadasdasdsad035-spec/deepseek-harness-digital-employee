# Agent Note: Marketplace hook packages and employee hook bindings

Status: implemented

English | [中文](2026-09-04-marketplace-employee-hooks.zh.md)

## Problem

Agent lifecycle hooks were host-configured only, so neither the marketplace nor digital employees could acquire interception behavior, and nothing tied hooks to a specific employee.

## Decision

`hook` becomes the third marketplace package kind, reusing the tool/mcp machinery (trust, file table, disclosure, managed lifecycle). A descriptor entry binds one shell command to one interception event; `invocable` entries additionally register a `hook__<id>` tool so chat participants trigger them on demand. The descriptor requires a non-empty matcher on every event except SessionStart so an always-on hook cannot ship silently. Employee templates reference installed hook packages by id; composition resolves references and fails before any Session when one is missing. Bindings are instance-scoped: the bridge mounts on the employee composition context, never the host plane.

## Alternatives considered

- **Generate a Claude Code hooks.json and reuse that bridge** — would route a typed surface through a foreign dialect parser and lose invocable-tool registration.
- **Global hook installation** — collides with instance scoping; host-wide hooks remain a cordis.yml concern.

## Consequences

Hook packages execute local code with the same disclosure posture as stdio MCP packages. The kind-widening is compile-time breaking only inside the repo. Invocable hooks extend the tool namespace with the `hook__` prefix under the same uniqueness discipline as `mcp__`.
