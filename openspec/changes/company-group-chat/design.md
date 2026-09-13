# Design: company-group-chat

## Context

Employee chat today is strictly one employee per session (the composer cannot select a second employee). Autonomous tasks already run headless with a durable task ledger (display name + employee id stamped per attempt), and the web host already polls that neighborhood for busy derivation. The user approved: broadcasts on 领到任务/完成/失败, every broadcast is a real in-character LLM turn, @mention routing in the MVP, and the floor-panel + sidebar entry points.

## Goals & Non-Goals

Goals: a living per-company work group fed by task lifecycle; employee-voiced reporting driven by each employee's own composition; owner @mentions reach employees; zero new domain stores.

Non-Goals: employee-to-employee chains, cross-company groups, manual group creation/invites, media attachments in messages (text first), group management UI beyond entry.

## Decisions

### D1. The group is an event-sourced conversation, not an LLM session

One session per company (`groupOf(companyId)`). Its transcript is assembled from typed plugin events `company-group/message` carrying `{speaker: 'user' | instanceId, displayName, text, context}` — plain session events, so persistence, sidebar listing, and the real-time WebSocket path come free. The group session itself never calls a model.

### D2. Speaking turns are real agent runs in child sessions

A speaking turn = one subagent-seam run started with the employee's full composition (the `subagent/compose` expert-composition hook already exists for exactly this), prompted with **only the situation**: group roster, recent group context, and the triggering fact (`task 开始/完成/失败 + 任务文本 + 产出摘要` or `用户 @你: 消息`). The employee's template prompt, skills, and tools decide what and how it answers — a 项目经理 may attach an output summary, a terse employee may answer in one line. On success the final text is quoted into the group as that employee's message; on failure/timeout a deterministic one-liner (`任务「X」完成` style) is appended instead. Model-visible ⟺ logged holds: the model call sees the group context inside its child session, and the quoted message is a logged session event.

### D3. Triggers come from an append-only task lifecycle log; the group log is the cursor

The attempt ledger is failure-state algebra (success makes records vanish), so it cannot be diffed into lifecycle. Instead the headless driver appends one line per fact (started / succeeded / failed-with-reason-and-suspension) to `$DSH_HOME/digital-employees/task-events.jsonl` (`dsh-digital-employee-file/task-events`, the ledger's cross-process lock pattern, monotonic `seq`, torn-tail tolerance) at the same three sites that already write the ledger. The host plugin tails this file (`pollIntervalMs` config, default 5 s) and maps each fact to a broadcast. Dedup needs no new store: an event `seq` is "already reported" iff the group's own event log carries its key — the group conversation is the cursor.

### D4. Mention routing reuses the same turn machinery

The owner's group message is appended as a `user` speaker message; `@displayName` prefixes (parsed against the current roster) enqueue a speaking turn for that employee with the message as context. Unmentioned messages just land — no auto-reply storm.

### D5. Membership is derived; entry points are two

Roster = current company bindings, read live at each trigger (bind/unbind updates who can speak; an unbound employee's pending turn is dropped). Entry: a 公司群聊 button on the console floor panel opens/creates the group; the group then behaves like any session in the sidebar. Multi-speaker rendering shows a name chip per message; employee colors may reuse department hues.

## Risks / Trade-offs

- One LLM call per broadcast: approved explicitly; `pollIntervalMs` plus per-event dedup bound the rate. A future `broadcastMode` config (`llm | terse`) is the escape hatch.
- Ledger polling misses nothing that busy-derivation misses — same source, same cadence; document that SQLite-persistence deployments have no per-attempt artifacts and rely on the ledger file.
- The chat surface's multi-speaker rendering must be validated against the actual conversation-renderer extension points during apply (task included; fallback is a dedicated group panel if the transcript renderer is single-agent-assumption-bound).

## Migration Plan

Additive host plugin + client wiring in the web-app patch layer; no persisted-format change. First open of a group creates its session; older companies simply have empty groups.

## Open Questions

None blocking; renderer extension point is a flagged apply-time investigation.
