## Context

`DigitalEmployeeAgent` already resolves experts and starts one-shot or continuable children through the shared subagent runtime. The Web bundle keeps the subagent registry in the Host plane, but currently disables the model-facing delegation rows in its preset overlay. The implementation must preserve per-Agent tool scope while avoiding process-wide registration collisions.

## Goals / Non-Goals

**Goals:**

- Provide a model-visible expert delegation operation backed by the existing expert resolver and child authority intersection.
- Provide ordinary subagent delegation only in explicitly enabled presets.
- Reuse existing child Session lifecycle, continuation, audit, and MCP composition mechanisms.
- Make invalid and unauthorized requests fail before child publication.

**Non-Goals:**

- Replacing the existing subagent runtime or creating a second scheduler.
- Allowing users to invoke experts directly by mention and bypass the parent employee.
- Making every configured expert a permanently running Agent.

## Decisions

- Add a digital-employee-specific model tool that resolves an expert from the active Agent's employee context and calls the existing service method. This keeps authorization in one owner instead of duplicating it in a generic tool.
- Keep ordinary `subagent` as a separate generic tool with its existing provider and lifecycle semantics. Enable it through preset composition and policy filtering rather than teaching the expert tool generic child behavior.
- Register model-facing tools in the Agent scope, while keeping `ctx.subagents` providers and Host APIs process-wide. This matches the current Web layering and prevents duplicate global provider registration.
- Pass child composition through the existing `subagent/compose` event so expert skills, tools, MCP clients, memory, identity, and instructions are applied at child creation time.
- Record model-visible delegation events in the parent Session and use the existing audit path for capability use. Secret-bearing MCP configuration remains excluded from event and audit payloads.
- Validate expert identifiers, prompts, provider names, and policy limits at the tool input or service admission point. No child is considered successful until its start operation has published a valid child handle.

## Risks / Trade-offs

- [Risk] Enabling generic subagent tools in Web can increase resource use and create more child Sessions. -> Mitigation: require explicit preset authorization and enforce configured depth, concurrency, timeout, and background limits.
- [Risk] A model may repeatedly delegate the same work. -> Mitigation: expose clear tool descriptions, preserve existing loop guards, and record each delegation for audit and diagnostics.
- [Risk] Per-scope tool names can collide with another mounted contribution. -> Mitigation: use the existing scoped registration and validation rules, with startup failure for self-contained conflicts.
- [Risk] A child may lose employee-specific composition if it is created outside the expert composition event. -> Mitigation: use the existing composition key and add assembled tests covering skills, tools, MCP, memory, and instructions.

## Migration Plan

1. Add the model tool and assembled registration in the source plane.
2. Enable the intended Web preset rows with explicit delegation policy configuration.
3. Run focused unit, Host, build, snapshot, and Web E2E checks.
4. Roll back by disabling the new preset rows; existing direct Host expert APIs remain available.
