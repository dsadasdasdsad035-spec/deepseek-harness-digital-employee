# Digital Employee Memory Wiring

## Why

Digital employee memory is stored and policy-managed (SQLite provider shipped) but unreachable in production: the model has no memory tool, so employees cannot save or recall memories during chat, and both live chat entries create task sessions without a memory query, so even stored memories are never projected into a prompt. The capability exists only in test drivers.

## What Changes

- Employee composition mounts a model-facing `employee_memory` tool with two actions: `save` submits a long-term candidate through the existing controlled-promotion policy (`digitalEmployeeAgent.promoteMemory`), and `search` runs a bounded employee-owned query. Tool calls carry session provenance and their accepted/rejected decisions land in the Session log as `digital-employee/memory-decision` events.
- The 1:1 chat entry (`digital-employee-management` startChat) and the group-chat member-session creation both pass a bounded long-term memory query to `createTask`, so the exact projection event (`digital-employee/memory-projection`) reaches the model prompt and the log. The projection is the employee's most recent N long-term memories; N is a validated plugin `Config` field on each entry (default 5).
- Cold-resumed group member sessions re-project memory on resume via `resumeTask`, so restored sessions see the same bounded memory as fresh ones.
- The `employee_memory` tool name joins the composition tool restriction allowlist (like hook/workflow/skill-loader tools) so the business-tool restriction cannot strip it.

## Capabilities

### New Capabilities

<!-- none -->

### Modified Capabilities

- `digital-employee-memory`: adds the model-facing memory tool requirement (save via controlled promotion, bounded search) and modifies retrieval so chat entries and cold-resumed member sessions supply the bounded model-visible projection.

## Impact

- `packages/core/digital-employee-agent`: tool mounting in `compose()` (restriction allowlist + tool registration calling `promoteMemory`/`queryMemory` with session provenance); `resumeTask` optional memory re-projection.
- `packages/host/digital-employee-management`: startChat passes the bounded memory query; new validated `Config` field.
- `packages/host/company-group-chat`: member `createTask`/`resumeTask` pass the bounded memory query; new validated `Config` field.
- `examples/headless-agent/tests/fixtures/core/project-manager-digital-employee`: snapshot transcript changes (the new tool joins `visibleTools`); driver gains memory-tool acceptance coverage.
- No wire-format or storage changes; memory policy, scopes, and provider behavior are unchanged.
