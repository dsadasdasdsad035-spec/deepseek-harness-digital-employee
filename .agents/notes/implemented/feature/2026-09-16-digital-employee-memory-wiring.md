# Agent Note: Digital employee memory wiring

Status: implemented

English | [中文](2026-09-16-digital-employee-memory-wiring.zh.md)

## Problem

Digital employee memory had a complete storage and policy layer (SQLite provider, controlled promotion, bounded retrieval) but no production path: the model had no memory tool, so employees could never save or recall anything during a turn, and both chat entries created task sessions without a memory query, so even seeded memories never reached a prompt. The capability existed only in test drivers — exactly the gap a storage-only change cannot close.

## Decision

Employee composition mounts one scope-local tool, `employee_memory`, for every employee. `save` builds the candidate with session provenance (`employee-memory-tool` source, `sensitive: false` — sensitivity stays provider policy, never model input) and flows through the existing `digitalEmployeeAgent.promoteMemory`, so preview sessions, decision logging, and policy enforcement are the production code paths, not parallel ones. `search` queries the composed employee's own records under the same scoring as task projection, limit default 5 and hard-capped at 20. The tool is registered in the agent scope, which the tools registry deliberately exempts from `tools.restrict()` validation — scope-local names are not restrictable — so it stays model-visible past business-tool restriction by contract rather than by an allowlist entry.

Both live chat entries now pass a bounded query: most-recent long-term memories via empty text (literal scoring makes user-message text nearly never match; empty text projects every memory ordered most-recent-first). The bound is a validated config field on each entry (`memoryProjectionLimit`, `memberMemoryProjectionLimit`; default 5, range 1–50), not a hardcoded tunable. `resumeTask` gains the same optional query, and only the group-chat cold-resume path passes it, so headless resume callers keep their behavior.

The project-manager assembled snapshot exercises the tool end to end: the driver saves a memory through the tool and the expected transcript pins the tool's presence in `visibleTools` plus the accepted decision with its session-logged decision event. The acceptance line records `memoryIdAssigned` rather than the UUID, keeping the transcript deterministic.

## Alternatives considered

- **Authority-gate the tool per template**: memory is intrinsic to the employee concept, the policy layer already governs writes, and gating would silently disable saves for existing templates without a migration.
- **Project memory matched against the user message**: under literal scoring this projects almost nothing in practice; most-recent-N is deterministic, bounded, and replaced by relevance ranking behind the same request shape when retrieval improves.
- **Always re-project on resume**: would change every existing resume caller (headless runner) without a consumer; only the group-chat cold-resume path asked for it.

## Consequences

Memory now has a full live loop: chat entries project it in, the model can save and search it mid-turn, decisions land in the session log, and cold-resumed group sessions see current memory. Policy failures surface to the model as tool results instead of silent drops. The empty-text projection is the known rough edge — it favors recency over relevance — and the retrieval upgrade should replace the query strategy behind the unchanged request shape.
