# Tasks: Digital Employee Memory Wiring

## 1. Memory tool in employee composition

- [x] 1.1 Add `mountEmployeeMemoryTool` to `digital-employee-agent`: register `employee_memory` with `save`/`search` action schema, generic render intent, and args validation (content/tags required for save; text/limit for search with limit default 5, max 20)
- [x] 1.2 Wire `save` through `digitalEmployeeAgent.promoteMemory(parent, candidate)` with provenance `{sessionId: current session, source: 'employee-memory-tool'}`; surface accepted/rejected decisions as the tool's text result
- [x] 1.3 Wire `search` through `ctx.digitalEmployees.queryMemory` scoped to the composed employee; render bounded record lines (id, scope, content, recordedAt)
- [x] 1.4 Add `employee_memory` to the composition `tools.restrict` allowlist (unconditional, like the skill-loader name)
- [x] 1.5 Unit tests: save acceptance + policy rejection reach the model as results; search never returns another employee's records; restriction keeps the tool visible

## 2. Chat entry projection

- [x] 2.1 Add validated `memoryProjectionLimit` (default 5, 1–50) to `digital-employee-management` Config; startChatAttempt passes `memory: { text: '', scopes: ['long-term'], limit }` to `createTask`
- [x] 2.2 Add validated `memberMemoryProjectionLimit` (default 5, 1–50) to `company-group-chat` Config; member `createTask` passes the same bounded query
- [x] 2.3 Unit tests: config validation bounds; createTask receives the memory query in both entries

## 3. Resume re-projection

- [x] 3.1 Extend `resumeTask` with optional `memory` request; when present, query and append `digital-employee/memory-projection` to the restored session before the turn and render the prompt section
- [x] 3.2 Group-chat cold-resume path passes the member memory query to `resumeTask`
- [x] 3.3 Unit test: cold-resumed member session logs a fresh bounded projection before its next turn

## 4. Snapshot and docs

- [x] 4.1 Extend the project-manager fixture driver with a memory-tool save acceptance and refresh `transcript.expected.jsonl` (tool now appears in `visibleTools`); update the snapshot assertions
- [x] 4.2 Update affected README contracts (digital-employee-agent, digital-employee-management, company-group-chat) and the memory capability docs for the tool and entry projection
- [x] 4.3 Write the Agent Note (en/zh + pairing) for the wiring change
- [x] 4.4 Run gates: typecheck, lint, doc-sync, hygiene, duplication, affected unit tests, and the snapshot suite (23 pre-existing failures stay the baseline)
