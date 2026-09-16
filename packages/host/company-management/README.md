# @deepseek-ai/dsh-host-company-management

English | [中文](README.zh.md)

Typed Host management gateway (`ctx.companyManagement`, Typert namespace `companies`) for the 3D company console: company CRUD (including the per-company `skinId` rendering-skin field, passed through to the provider), promotional images admitted through the attachment pipeline, department maintenance, employee-instance binding against live instances, and the `companyFloor` projection. The floor joins bindings with instance data and computes each seat's busy verdict: a running live session is chat-busy (real-time over the existing WebSocket status frames), while a non-live session artifact written inside the freshness window (`taskActiveWindowMs`, default 60 s) by the headless runner is task-busy. Busy verdicts are runtime facts and never persisted. The gateway subscribes to `digital-employees/before-delete` and unbinds deleted instances.

The busy verdict resolves an employee's sessions through its durable audit records, so it depends on the employee composition actually writing capability attribution; an employee whose sessions are never audited reads as permanently idle. That attribution is what lets a group member session — or any other employee-owned session — count as chat-busy while it runs.

## Model Experience

None, as this package serves the management console; it contributes no prompt content, tools, or session events.

#### KV Cache effect

None; company state never enters a model request.

## Known Limitations and Deferred Work

- **Task-busy is a freshness heuristic** — a silent model call longer than `taskActiveWindowMs` reads as idle until the next write.
- **No task-busy on SQLite persistence** — backends whose `locate()` returns no per-session artifact cannot signal another process's writes.
- **No deep employee selection** — the console can open the digital employee workspace but cannot deep-select one employee from a seat.
