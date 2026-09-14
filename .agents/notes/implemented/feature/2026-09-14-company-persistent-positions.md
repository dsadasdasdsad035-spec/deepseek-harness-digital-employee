# Agent Note: Company persistent positions (durable fleet and employee coordinates)

Status: implemented

English | [中文](2026-09-14-company-persistent-positions.zh.md)

## Problem

Every scene entry re-randomized the world: NPCs reset to their desks and all twelve cars respawned on random edges. The user asked for continuity — employees are durable instances that must resume from their last coordinates (only a newly created employee appears at the desk), and cars need stable fleet identities where only first-appearance cars get random spawns.

## Decision

- **One durable store, stable ids, merge writes.** `dsh-company-file/world-state` owns `$DSH_HOME/companies/world-state.json`: `cars: Record<"car-<i>", {from,to,t,speed,at}>` and `employees: Record<employeeId, {companyId,x,z,seated,at}>`; `reportCompanyWorldState` merges under `withFileLock` + atomic write (the whereabouts pattern), reads strict. Wire types ride `dsh-company` (`CompanyWorldStateView` and friends); the management gateway exposes `readCompanyWorldState`/`reportCompanyWorldState` on the `companies` namespace.
- **Restore validates, then falls back.** Campus build: a saved car restores only when both node indices exist in the current road graph and 0≤t<1 — otherwise random spawn (first appearance or graph change). Floor build: after the registry is complete, a saved employee position restores only when collision-clear (own desk/PC ignored); `seated` restores the sit phase, standing restores standing with a short dwell so wandering resumes. Invalid or company-mismatched entries fall back to the seat — layout changes can never place an NPC inside a wall.
- **Reporting cadence.** While the console overlay is open, the workspace reports the scene's `snapshotWorldState()` every 5 s (cars' live edge/progress/speed + visible floor NPCs) and once more on close; the store loads the state alongside the companies list and hands it to `setCampus`/`setFloor`.

## Alternatives considered

- **Per-entity remotes** — one batched read + one batched merge is enough; per-car/per-employee calls would multiply round-trips for no benefit.
- **Session events for positions** — positions are presentation data that never enter model requests; a world file is the honest home.
- **Exact resume (mid-edge interpolation on load)** — 5 s snapshots make car resume approximate by design ("continue from the last coordinate"); exactness would require unload-time flushes that refreshes bypass anyway.

## Consequences

Store unit tests (empty read, merge semantics, corruption fails loud) and a gateway round-trip test cover the seam; the company-console keyless snapshot gained read-empty → report → read-back acceptance lines (replay green). Full gates green; the service runs the build. Known limitations: a host restart loses at most one 5 s window; employees of companies whose floor was never opened simply have no entry (seat fallback); car colors re-roll per entry (identity is the motion state, not the paint — acceptable until car identity matters visually). Deferred: per-car persistent colors, unload-time flush, employee facing direction.
