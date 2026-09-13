# Tasks: company-group-chat

## 1. Host: group conversation model

- [x] 1.1 New package `@deepseek-ai/dsh-host-company-group-chat`: group session per company (`groupOf`), `company-group/message` typed event `{speaker: 'user' | instanceId, displayName, text, context}`, open/append/list remotes on the `companies` Typert gateway
- [x] 1.2 Unit tests: group open is idempotent, messages persist and replay, membership snapshot derives from live bindings
- [x] 1.3 Typert artifacts regenerated + sync spec updated (zod dependency, gateway namespace test)

## 2. Host: task-lifecycle broadcasts

- [x] 2.1 Task lifecycle log: `dsh-digital-employee-file/task-events` (append-only `task-events.jsonl`, sequenced, locked, torn-tail tolerant) + headless driver appends started/succeeded/failed at its three ledger sites; unit tests (5)
- [x] 2.2 Host watcher: tail the lifecycle log (`pollIntervalMs` config, default 5 s), map facts to 领到任务/完成/失败 triggers, dedup by the group's own event log (group-as-cursor)
- [x] 2.3 Speaking-turn executor: subagent-seam run with the employee composition + situation prompt (roster + recent context + trigger fact; no script); quote final text as the employee's group message; deterministic one-liner fallback on failure/timeout
- [x] 2.4 Unit tests: trigger mapping, dedup by group log, fallback path (mock subagent provider), unbound-employee turn dropped

## 3. Host: mention routing

- [x] 3.1 User message append + `@displayName` parsing against the live roster; mentioned employees get a speaking turn with the message as context; unmentioned messages land with no auto-reply
- [x] 3.2 Unit tests: mention parse (exact and prefix match, unknown mention ignored), one turn per mentioned employee

## 4. Client

- [x] 4.1 Conversation-renderer investigation resolved to the design's dedicated-panel fallback: the group renders inside the company console (speaker-chip messages, member roster, 2.5 s polling), group sessions also appear in the session sidebar by title
- [x] 4.2 「公司群聊」 button on the console floor panel opens/creates the group (「← 返回面板」 returns); the group session carries the 「公司名 群」 title in the sidebar
- [x] 4.3 Composer with member chips (@点击插入), Enter/发送 send; live-verified: message lands, @mention triggers the speaking turn, keyless fallback line quotes in-character name

## 5. Snapshot and gates

- [x] 5.1 Keyless assembled snapshot (mock LLM): company + bound employees + seeded ledger → 任务完成 broadcast quoted in group → user @mention → employee reply → fallback line on forced failure; expected outputs recorded
- [x] 5.2 Gates: typecheck, lint, unit tests, snapshot replay, hygiene, doc-sync (catalogs/README/note), `openspec validate`

## 6. Verification and docs

- [ ] 6.1 Live 3080: open 星桥科技 group from floor panel, trigger a real task completion (or seeded ledger), watch the employee speak in-character, @mention round-trip, fallback visible in logs
- [ ] 6.2 Docs: package README (EN/ZH), Agent Note, memory update, task checkboxes
