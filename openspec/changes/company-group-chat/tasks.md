# Tasks: company-group-chat

## 1. Host: group conversation model

- [ ] 1.1 New package `@deepseek-ai/dsh-host-company-group-chat`: group session per company (`groupOf`), `company-group/message` typed event `{speaker: 'user' | instanceId, displayName, text, context}`, open/append/list remotes on the `companies` Typert gateway
- [ ] 1.2 Unit tests: group open is idempotent, messages persist and replay, membership snapshot derives from live bindings
- [ ] 1.3 Typert artifacts regenerated + sync spec updated (zod dependency, gateway namespace test)

## 2. Host: task-lifecycle broadcasts

- [ ] 2.1 Ledger watcher: poll task attempts (`pollIntervalMs` config, default 5 s), diff against the group log (group-as-cursor dedup), map new-attempt/success/strike-suspend to 领到任务/完成/失败 triggers
- [ ] 2.2 Speaking-turn executor: subagent-seam run with the employee composition + situation prompt (roster + recent context + trigger fact; no script); quote final text as the employee's group message; deterministic one-liner fallback on failure/timeout
- [ ] 2.3 Unit tests: trigger mapping, dedup by group log, fallback path (mock subagent provider), unbound-employee turn dropped

## 3. Host: mention routing

- [ ] 3.1 User message append + `@displayName` parsing against the live roster; mentioned employees get a speaking turn with the message as context; unmentioned messages land with no auto-reply
- [ ] 3.2 Unit tests: mention parse (exact and prefix match, unknown mention ignored), one turn per mentioned employee

## 4. Client

- [ ] 4.1 Investigate and pick the conversation-renderer extension point for multi-speaker messages (name chip per message); implement group transcript rendering, streaming via existing WebSocket session events
- [ ] 4.2 公司群聊 button on the console floor panel opens/creates the group; group appears in the session sidebar with company identity
- [ ] 4.3 Composer for the group (text send; @ roster autocomplete from current bindings)

## 5. Snapshot and gates

- [ ] 5.1 Keyless assembled snapshot (mock LLM): company + bound employees + seeded ledger → 任务完成 broadcast quoted in group → user @mention → employee reply → fallback line on forced failure; expected outputs recorded
- [ ] 5.2 Gates: typecheck, lint, unit tests, snapshot replay, hygiene, doc-sync (catalogs/README/note), `openspec validate`

## 6. Verification and docs

- [ ] 6.1 Live 3080: open 星桥科技 group from floor panel, trigger a real task completion (or seeded ledger), watch the employee speak in-character, @mention round-trip, fallback visible in logs
- [ ] 6.2 Docs: package README (EN/ZH), Agent Note, memory update, task checkboxes
