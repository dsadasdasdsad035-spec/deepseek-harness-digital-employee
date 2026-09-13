# Agent Note: Company 3D module (campus console over employee instances)

Status: implemented

English | [中文](2026-09-13-company-3d-module.zh.md)

## Problem

Digital employee instances live in a flat management list with no organizational grouping. Owners running many instances need companies as the grouping unit (category, legal representative, address, promotional image), departments inside each company, and an at-a-glance view of who is working — the request asks for a Three.js 3D presentation: companies as little houses on a campus, interiors with department zones and seats, and per-employee busy/idle status flipping in real time.

## Decision

Four packages on existing seams, no loop or session-log changes:

- **`@deepseek-ai/dsh-company`** — Service Definition (`ctx.companies`) + client-safe wire types. Provider seam over company CRUD, departments, bindings, and promo-image refs; every mutation publishes `companies/change` naming the affected company. One instance binds at most one company and one department; `departmentId: null` is the company's unassigned group (department deletion moves members there instead of dropping bindings).
- **`@deepseek-ai/dsh-company-file`** — JSON document at `$DSH_HOME/companies/companies.json`, `SCHEMA_VERSION = 1`, `withFileLock` + `writeFileAtomic` (the digital-employee-file pattern). Preset departments 总裁/人力/行政/IT/销售 seeded on creation; unique department names per company enforced; unknown schema versions reject loud.
- **`@deepseek-ai/dsh-host-company-management`** — Typert gateway (`companies` namespace, 17 remotes) including `companyFloor`: joins bindings with instance data and emits per-seat busy verdicts. **Busy is derived, never persisted**: a live `ctx.agents` session with `status === 'running'` is `busyKind: 'chat'`; a non-live session artifact whose `mtime` is inside `taskActiveWindowMs` (default 60 s) counts as `busyKind: 'task'` — that is the headless runner's footprint, since it runs in another process and only its session writes are observable. The gateway subscribes `digital-employees/before-delete` and unbinds. Promo images go through `admitEncodedImages` into the attachment store; the record keeps the full verified ref (`attachmentId/mediaType/bytes/width/height`) because `readImage` verifies bytes against it.
- **`@deepseek-ai/dsh-client-ui-companies`** — browser plugin riding `sidebar.footer.action` (entry) and **`shell.overlay`** (full-screen surface). `shell.application` is a single seat owned by the digital employee workspace whose second registrant could only shadow it, so the console takes the additive overlay seat instead. Three.js (0.180) is inlined into the client bundle with `@types/three` dev-typed; all geometry is procedural (box houses with category-hued roofs scaling with headcount, canvas-sprite Chinese labels, capsule employees at desks with emissive screens and 在忙/空闲 chips). Chat-busy rides the live WebSocket session running bits (the sessions list store already mirrors `host/session-status` frames), so seats flip without refetching; task-busy refreshes through a 5-second `companyFloor` poll while the console is open.

## Alternatives considered

- **SQLite store** (user-accounts precedent) — company data is small, single-writer, and has no unique-constraint query pressure; the JSON document keeps the digital-employee family isomorphic. Revisit on multi-node.
- **Host-pushed live busy events** (forwarded-events entry) — the dominant live signal already streams over the WebSocket as session status frames; a host event channel would duplicate it, and the task-side signal is only observable by the host through the same freshness polling anyway.
- **Seats stored on bindings** — seat coordinates are a layout fact of the view, not of the domain; the client derives desks from department membership (spare desks included) so member churn never leaves stale seat data.
- **`react-three-fiber`** — the frozen module table shares only React itself; fiber would inline a second reconciler with version coupling. One imperative `CompanyScene` class behind a React component is smaller and disposes cleanly.

## Consequences

company-3d-module is implemented with green store tests (11), gateway tests (6, including the typert sync spec), and a keyless assembled snapshot (`examples/headless-agent/tests/fixtures/core/company-console/`) replaying company creation → custom department → bindings → idle floor → task-busy flip → department deletion to unassigned → promo pipeline → deletion. The live 3080 instance verified login → console open → company creation → 3D campus house → interior with seated employees (visual confirmation of people, screens, and status chips). Boundaries: task-busy is a freshness heuristic (a silent model call longer than the window flickers idle); geo-positioning was explicitly out of scope (address is text + a 3D sign); the employee-detail jump opens the digital employee workspace but cannot deep-select the employee (no cross-plugin select API); SQLite-backed session persistence deployments get no task-busy signal because `locate()` returns no per-session artifact there (the web bundle's jsonl backend does).

## Gotchas

- `tsdown` externalizes exactly the requested module-table specifiers; the generated `typert.remote-client.js` importing zod must be inlined by the api-remotes client pass — a stale `lib/client.js` from an earlier build order produced `require("zod") missed the module table` in the browser; rebuilding the client face fixes it.
- New fixture bare plugins need `examples/headless-agent/package.json` + `examples/package.json` dependency rows and `tsconfig.base.json` paths entries (`verify-cordis-config` enforces).
- The jsonl persistence fixture needs `compression: none` plus a well-formed header line (`type: 'session'`, `delegationDepth`) for `list()` to see a driver-written artifact.
- Snapshot drivers must echo only stable facts (names, verdicts, counts) — company ids and timestamps are UUID/now and would break replay.
