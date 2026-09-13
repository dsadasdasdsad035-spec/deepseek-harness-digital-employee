# @deepseek-ai/dsh-host-company-group-chat

English | [中文](README.zh.md)

Per-company work groups over existing seams: one event-sourced group session per company (`company-group/message` events with speaker attribution), membership derived live from company bindings, and employee-voiced task broadcasts. The gateway tails the headless driver's append-only task lifecycle log (`task-events.jsonl` via `@deepseek-ai/dsh-digital-employee-file/task-events`) and turns 领到任务 / 完成 / 失败 facts into speaking turns — a short-lived employee session (`origin: 'subagent'`, hidden from the sidebar) carrying the employee's full composition, prompted with the situation only, never a script; failures degrade to a deterministic one-liner. User messages land in the group and `@displayName` mentions route a speaking turn to that employee. The group session itself never calls a model; its own event log doubles as the broadcast dedup cursor.

## Model Experience

None, as this gateway only quotes speaking-turn outputs into group sessions; the employee model calls run in the digital employee agent's child sessions, not here.

#### KV Cache effect

The situation prompt is short and per-turn; the employee composition (the cache-heavy prefix) is identical to that employee's normal sessions, so cache behavior follows the employee preset unchanged.

## Known Limitations and Deferred Work

- **No employee-to-employee chains** — a broadcast answers nothing; colleagues only speak when task events fire or the user @mentions them.
- **Poll-based triggers** — the lifecycle log is tailed every `pollIntervalMs` (default 5 s); completion broadcasts lag the runner by up to one interval.
- **No group management UI** — groups are created on first open or first broadcast; membership follows bindings with no manual invites.
