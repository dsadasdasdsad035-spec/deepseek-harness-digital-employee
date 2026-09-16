# @deepseek-ai/dsh-host-company-group-chat

English | [中文](README.zh.md)

Per-company work groups on the agent-loop spine: one group session per company with a Lead root Agent, membership derived live from company bindings, and continuable employee member sessions. User messages travel the standard `session.prompt` path into the Lead; a deterministic `agent/pre-step` router lands them as `company-group/message` events, queues `company-group/turn-queued` deliveries for every `@displayName` mention, and ends the turn without spending any model call. Each (company, employee) pair owns one persistent member session (`session-group-member-<companyId>-<employeeId>`, `origin: 'subagent'`, hidden from the sidebar) created or resumed through `digitalEmployeeAgent` with the employee's full composition, projecting the member's most recent long-term memories up to `memberMemoryProjectionLimit` (default 5, range 1-50) on both fresh creation and cold resume; deliveries inject the situation plus a bounded group snapshot, stream as ordinary loop turns (tools, chunks, cancel), and their final utterance is written back as an employee-voiced message. The gateway tails the headless driver's append-only task lifecycle log (`task-events.jsonl` via `@deepseek-ai/dsh-digital-employee-file/task-events`) and turns 领到任务 / 完成 / 失败 facts into the same queue, deduped by a log cursor (`dedupKey: task:<seq>`); failed, timed-out (cancelled), or dropped deliveries settle on a deterministic one-liner. The queue itself is durable — `company-group/turn-delivered` events settle queued ones, and a host restart replays queued-minus-delivered. The namespace also carries `cancelCompanyGroupTurn`, the read-only `listCompanyGroupMembers` (one company's bound roster, resolved without opening the group or touching persistence; it feeds the client's `@` mention picker and matches the router's roster), and the durable presence remotes `reportEmployeeVisit`/`employeePresence` (each employee's capped amenity-visit history in `whereabouts.json`), proving instance continuity across refreshes.

## Model Experience

None, as this gateway routes mentions and quotes member utterances into the group session; the employee model calls run in the continuable member sessions.

#### KV Cache effect

Every delivery re-enters the same member session, so the employee composition (the cache-heavy prefix) and that member's own history stay hot across turns; the per-delivery prefix growth is the situation plus a bounded group snapshot.

## Known Limitations and Deferred Work

- **No employee-to-employee chains** — a broadcast answers nothing; colleagues only speak when task events fire or the user @mentions them.
- **Poll-based triggers** — the lifecycle log is tailed every `pollIntervalMs` (default 5 s); completion broadcasts lag the runner by up to one interval.
- **No group management UI** — groups are created on first open or first broadcast; membership follows bindings with no manual invites.
