# Agent Note: Company group chat (per-company work groups)

Status: implemented

English | [中文](2026-09-13-company-group-chat.zh.md)

## Problem

Digital employees run autonomous tasks invisibly and chat only one-on-one. Owners asked whether company-bound employees are the same roster as the 组织 dropdown (yes — instances, not templates) and then asked for per-company work groups: every bound employee speaks there when they take on or finish/fail a task, phrased in that employee's own voice, with the owner able to reply and @mention.

## Decision

- **The group is an event-sourced session, never an LLM session.** One deterministic session per company (`session-company-group-<id>`); messages are typed `company-group/message` events `{speakerKind, employeeId?, displayName, text, taskEventSeq?, context}` (declaration-merged into `SessionEventMap`; **no `@mode` tag** — it is a session log event, not a cordis bus event). Persistence, the sidebar title, and realtime all ride existing machinery; the group session itself calls no model.
- **Triggers come from an append-only task lifecycle log.** The attempt ledger is failure-state algebra (success deletes records), so the headless driver now appends `started/succeeded/failed(+reason+suspended)` facts to `$DSH_HOME/digital-employees/task-events.jsonl` (`dsh-digital-employee-file/task-events`: monotonic seq, `withFileLock`, torn-tail tolerance) at the same three sites that write the ledger. The gateway tails it (`pollIntervalMs`, default 5 s, schema floor 500 ms); boot's first poll skips history; the group's own event log is the dedup cursor (`context: "task:<seq>"`).
- **Speaking turns are real employee sessions, hidden from the sidebar.** `digitalEmployeeAgent.createTask` with `meta { origin: 'subagent', delegationDepth: 1 }`, an initial situation message (roster + recent context + the trigger fact; **never a script**), and the employee memory query; race `whenIdle()` against `turnTimeoutMs` (120 s); quote `lastAssistantText` as the employee's group message; on failure/timeout append the deterministic one-liner instead. Turns serialize on a promise chain with public `settle()`; `pollNow()` runs an immediate poll for tests.
- **Mentions reuse the turn machinery.** User messages land with speaker `我`; `@displayName` (substring match against the live roster) enqueues a turn with the message as context; unmentioned messages trigger nothing.
- **Client: dedicated group panel (the design's fallback, taken deliberately).** The console's floor panel gains 「公司群聊」; the side panel swaps to a group view (speaker-chip messages, member chips that insert @mentions, composer, 2.5 s polling). Wiring lesson: a new remote namespace must add BOTH the value import and `export type {} from '<pkg>/remote'` in the api-remotes client (the TypertRemoteNamespaceMap merge is type-side-effect), and consumers read the BUILT client face, so a full rebuild is required.

## Alternatives considered

- **Multi-mounted session / agent-loop fan-out** — violates plugins-not-loop-changes; one root Agent per session is load-bearing everywhere.
- **Ledger-diff triggers** — success erases records; an event log is the honest source.
- **In-chart-surface multi-speaker rendering** — the conversation renderer assumes a single assistant stream; the panel delivers the interaction without touching it (sidebar listing still comes free through the session title).

## Consequences

Snapshot rail: the company-console fixture composes the real gateway with a stubbed `digitalEmployeeAgent` (scripted utterance; `FORCE_FAIL` in the situation forces the fallback) and a fixture-local task-events log redirect ordered before the gateway; the driver asserts group-opened / group-mention / group-task-broadcast (task:1 cursor) / group-fallback, replay green. One-shot drivers now end with an explicit `process.exit` — after group traffic, the assembled process's stdio pipes outlive `fiber.dispose()` and execa's exit detection never fires (no leaked handles: only stdio sockets remain). Live verification: panel opens with a derived roster (an employee whose template is not mounted is correctly skipped — 小明/project-manager-demo), user messages land, @mentions enqueue turns, and the keyless deployment shows the deterministic fallback line. With an API key configured the same path produces in-character speech. Known limitations: broadcasts lag the runner by up to one poll interval; no employee-to-employee chains; group messages render only in the console panel (opening the group session in the chat surface shows an empty conversation). Deferred: chat-surface speaker rendering, group unread badges, cross-company groups.
