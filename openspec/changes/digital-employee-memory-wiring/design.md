# Design: Digital Employee Memory Wiring

## Context

The storage layer is done: `ctx.digitalEmployees.queryMemory/promoteMemory` work against SQLite (or the file provider in fixtures), `createTask` already accepts `request.memory` and renders the bounded projection as a `digital-employee/memory-projection` event plus a system-prompt section, and `digitalEmployeeAgent.promoteMemory(parent, candidate)` already records `digital-employee/memory-decision` on the parent session with preview-session handling. Nothing production-facing calls any of it: the model has no tool, and the two chat entries never pass a memory query. Expert delegation sets the pattern for an agent-owned composition tool (`mountExpertDelegationTool` + a name added to the composition restriction allowlist, like hook/workflow/skill-loader tools).

## Goals / Non-Goals

Goals:
- The model can save and search its own employee's memories during any employee turn (1:1 chat, group chat, autonomous tasks — composition is shared).
- Chat entries project bounded long-term memory without new wire formats.
- Restored group member sessions see the same memory as fresh ones.

Non-Goals:
- No retrieval-quality change (literal tag/content scoring stays; swapping the query strategy later is provider-side).
- No memory management UI, no user-facing memory editing, no per-template opt-in switch for the tool.
- No expert-child memory writes beyond what delegation already projects (experts keep read-only `memoryAccess` behavior).

## Decisions

### D1: One tool, two actions, always mounted

`employee_memory` (kebab-free snake name matching tool naming like `project_board`) is mounted by employee composition for every employee, not gated by `authority.tools`.

- Why not authority-gated: memory is intrinsic to the employee concept (like instructions), and the policy layer (sensitive/retention/duplicate) already governs writes; an authority switch would silently disable saves and need template migration.
- `save` builds the candidate (`employeeId`, content, tags, `sensitive: false`, provenance `{sessionId: current session, source: 'employee-memory-tool', recordedAt: now}`) and calls `digitalEmployeeAgent.promoteMemory(parent, candidate)`; the returned decision (accepted/rejected + reason) is the tool's text result. Sensitivity stays provider-policy-only — the model never marks memories sensitive.
- `search` calls `ctx.digitalEmployees.queryMemory` scoped to the session's employee with caller-supplied text and limit (validated bound, default 5, max 20) and renders id/scope/content/recordedAt lines.
- Render intent: `generic` (pure function of args, decided up front).
- The tool name joins the composition `tools.restrict` allowlist unconditionally, following the skill-loader pattern.

Alternative rejected: two separate tools (`memory_save`/`memory_search`) — doubles schema surface for one capability; a discriminated `action` keeps one entry in every tool list.

### D2: Entry projection is most-recent-N via empty query text

Both chat entries pass `memory: { text: '', scopes: ['long-term'], limit: N }`.

- Why empty text: scoring is literal; an empty query matches every memory (score 1) and the existing ordering yields most-recent-first, so projection is deterministic, bounded, and useful today. Passing the raw user message would almost never literal-match and would usually project nothing.
- N is a validated `Config` field: `memoryProjectionLimit` (default 5, range 1–50) on `digital-employee-management`, and `memberMemoryProjectionLimit` (default 5, range 1–50) on `company-group-chat`. No hardcoded tunables.
- Projection only appends when memories exist (the existing compose behavior keeps an empty projection out of the prompt).

### D3: resumeTask re-projection is explicit and group-chat-driven

`resumeTask` gains an optional `memory` request field (same shape as `createTask`); when present it queries and appends `digital-employee/memory-projection` to the restored session before the turn, and `compose` renders the section. Only the group-chat resume path passes it in this change — the 1:1 resume flow is served by fresh `startChat` sessions today.

Alternative rejected: always re-project on resume — changes behavior for every existing resume caller (headless runner) without a consumer asking for it.

### D4: Coverage through the project-manager assembled snapshot

The project-manager fixture already drives a full employee turn over the mock model with memory seeding. The driver's scenario gains a memory-tool save (model-visible tool call in the transcript) and the assertion list gains the `employee_memory` tool visibility plus the projection/decision events; the expected transcript is refreshed in the same PR. Unit tests cover the tool's save/search actions (policy rejection surfaced to the model), both entry configs' validation bounds, and resume re-projection.

## Open Questions

None — the empty-text most-recent projection is a deliberate, reversible default that the retrieval upgrade will replace with relevance ranking behind the same request shape.
