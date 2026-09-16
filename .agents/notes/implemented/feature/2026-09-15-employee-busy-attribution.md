# Agent Note: Digital employee capability attribution reaches the audit log

Status: implemented

English | [中文](2026-09-15-employee-busy-attribution.zh.md)

## Problem

The 3D company console has a long-standing requirement that a seat shows "busy" while its employee is working in a session, and the scene code for it — screen glow, head label, walk-back-to-desk — was already implemented and shipped. It never fired. Driving the real service showed why: with `@项目经理` asked to write a weekly report, `companyFloor` reported `busy: false` on 40 polls across 60 seconds, even though the member session was a genuinely running loop.

The verdict resolves an employee's sessions from its durable audit records:

```
busyVerdict(id) -> employeeSessionIds(id) -> digitalEmployees.listAudit(id)
```

and the audit log was always empty. The write site, `installAudit`, read the Agent with `agentCtx.get('agent')` and returned early when it was `undefined`.

`agentCtx` comes from agent-loop's `scope.ctx.extend({ agent })`. But `ctx.get(name)` reads only the cordis service store (`provide()`), while `extend()` attaches a plain prototype-chain property — so `get('agent')` was always `undefined` at runtime and the audit was skipped silently. Unit tests missed it because they registered the Agent with `provide('agent', child)`, a shape production never uses: green tests, dead code in deployment.

The silent skip also meant the `digital-employee-capabilities` requirement "Capability use is attributable" had never actually held, and the desk screen's chat tail (also audit-derived) stayed blank.

## Decision

- **Read the acting Agent as a scope property, not a service.** `agentCtx.agent` hits the declaration-merged `Context.agent` that agent-loop's `extend({ agent })` supplies. The service lookup was the bug.
- **Do not skip when the Agent is absent.** Absence is a composition wiring fault, not a reason to lose attribution, so it now throws with the employee and scope named. A silent `return` is what let this hide.
- **Keep the busy verdict audit-derived.** Member session ids are deterministic (`session-group-member-<companyId>-<employeeId>`) and could be derived without the audit, but the audit is the authority for attribution; a second deterministic path would both bypass that authority and mask any future audit break. Fixing the write side restores the read side.
- **No scene change.** `busyVerdict` already returns chat-busy for any running employee session; once the sessions are known, the existing scene presentation does the rest.

## Alternatives considered

- **Register the Agent as a service in agent-loop** (`provide('agent', this)`) so `get('agent')` works — widens this fix into the loop's service surface and duplicates the existing `Context.agent` declaration. Rejected.
- **Pass the Agent as a new `compose` parameter** — `compose` already receives `agentCtx`; a second channel is redundant. Rejected.
- **Deterministic session-id fallback in `busyVerdict`** — rejected for the reason in the decision above; kept as an open question.

## Consequences

Verified end to end against a real service with real model calls: `busy` flipped ON 1.5 s after the group mention (kind `chat`) and OFF ~9 s later when the turn finished, and `employees.json` grew from 0 to 6 audit records — all attributed to `session-group-member-…`, the employee's group member session. Package tests now cover the employee task path (create and resume) with the exact `extend({ agent })` shape production uses, plus a dedicated regression that asserts `agentCtx.get('agent')` is `undefined` while attribution still lands. A side benefit: the previously-inert attribution requirement is now real, and the desk screen's chat tail has data again.

## Problem space left open

- Whether `busyVerdict` should keep a deterministic session-id fallback in case attribution ever regresses again (deliberately not added).
- Whether busy should distinguish *who* called the employee to work (group vs direct chat vs autonomous task); today both chat paths read as the single `chat` kind.
- Seat label wording is "在忙" while the requirement text says "工作中"; a copy decision, not addressed here.
