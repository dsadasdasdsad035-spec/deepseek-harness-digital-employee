# Proposal: company-group-chat

## Why

Digital employees already run autonomous tasks in the background, but their work is invisible until the owner opens each employee's audit view. Owners expect a company work group: every bound digital employee speaks in it when they take on a task or finish/fail one — phrased in that employee's own voice (its template prompt, skills, and tools decide how it reports) — and the owner can reply and @mention employees who then answer in the group.

## What Changes

- New capability `company-group-chat`: one durable group conversation per company, membership derived from current bindings (no new employee or group store).
- Host plugin `@deepseek-ai/dsh-host-company-group-chat`: watches the employee task ledger, converts 领到任务 / 完成 / 失败 transitions into **speaking turns** — a real subagent run carrying that employee's full composition, given only the situation (never a script) — and appends the utterance to the group as a speaker-attributed message. LLM failure degrades to a deterministic one-liner so the group never goes silent.
- User interaction: the owner's group messages land in the conversation; `@displayName` mentions route a speaking turn to that employee with the mention context. No employee-to-employee chains in this change.
- Client: a 公司群聊 button on the company console floor panel opens the group; the group appears in the session sidebar and renders as a multi-speaker chat (speaker name chips), streaming over the existing WebSocket session events.
- Speaking-turn model calls live in their child sessions with the group context injected; the group conversation itself is an event-sourced session assembled from typed plugin events (model-visible ⟺ logged holds).

## Capabilities

### Added

- `company-group-chat`: group lifecycle, membership derivation, task-lifecycle broadcasts, speaking-turn semantics, mention routing, deterministic fallback, and the console entry point.
