# Agent Note: Company living world (registry, collision, moods, whereabouts, bound screens)

Status: implemented

English | [中文](2026-09-14-company-living-world.zh.md)

## Problem

The 3D company world was choreography: cars passed through cars, NPCs through furniture, nothing recorded where employees had been, and computers were props. The user asked for a living world — every entity located with boundaries and mutual collision, employee instances with durable proof of existence (visit history surviving refresh; vehicles stay refresh-random by design), collision-fed moods with purely-visual vandalism, and computers bound to their employees showing that employee's real conversation tail.

## Decision

- **One client-side entity registry, per-class collision strategies.** `EntityRegistry` in `scene.ts` records `{id, kind fixture|car, position, halfExtents, destructible?, damage, object?}`; builders register fixtures in world coordinates (pantry counter, lounge sofa/table, toilet sinks, smoking bench/ashtray, every member desk and PC via `spawnNpcs` where the room origin is known). Cars use an edge-local car-following gap (same-edge leader < 6 units holds the follower — queues, no pass-through); NPC steps probe `blockingFixture` (slide along x then z; fully blocked accumulates mood and re-plans after 6 blocks; destroyed rubble passes); walkers pairwise crowd (< 0.7 → one yields, both gain mood). No physics engine.
- **Durable whereabouts prove instance continuity.** `dsh-digital-employee-file/whereabouts` owns `whereabouts.json` (lock + atomic write, newest-first, capped 50); the group gateway exposes `reportEmployeeVisit`/`employeePresence` on the `companyGroups` namespace; the scene fires the reporter on every amenity arrival and desk return (place names 茶水区/休息区/厕所/吸烟区/工位, never raw coordinates). Positions stay presentation-only; the visit record is coarse, cheap, and human-meaningful.
- **Moods are runtime, vandalism is visual.** Mood 0–100 accumulates from crowding and blocked steps, decays 1.5/s; ≥50 shows a 😡 head chip; ≥85 passers-by kick a destructible fixture 40% → damageStep advances intact → damaged (tilt/sink) → destroyed (toppled, passable). No gameplay effects, no repair loop, resets on refresh.
- **Bound computers show the real chat tail.** `CompanyFloorMember.chatTail` folds the trailing assistant texts of the employee's newest session (live store first, then an opportunistically-warmed persistence cache; the management test harness's bare stubs are tolerated); the client paints the last texts onto a canvas-textured side panel beside the busy screen.

## Alternatives considered

- **A general physics engine** — the plan is a corridor with door gaps; three narrow strategies (car gap, AABB probe, pairwise yield) deliver visible physics at trivial cost.
- **Session-log visit events** — positions never enter model requests; a per-visit file record is the honest granularity for "this instance has been here".
- **Durable damage** — the user chose purely-visual damage; persistence would need ownership, repair, and migration for zero gameplay value.

## Consequences

57 tests green across the touched suites (registry collision table, whereabouts store, gateway presence remotes, group + management + console suites); snapshot replay, doc-sync (28), hygiene (13), lint/typecheck/build all green; the service runs the build on 3080. Live automated verification of motion-dependent behavior (wandering, visits, kicks) is blocked by the known IAB occlusion (rAF suspends when the tab is hidden — the canvas freezes), so those visuals stay for the user's screen; the deterministic units cover the mechanics. One real bug was found and fixed en route: the doc-graph dependency cycle caused by the gateway's apiproxy type-import — the gateway now reaches the API gateway only through structural `ctx.inject`/`ctx.get` access with no package edge, and the cycle vanished. Known limitations: NPC crowding is O(n²) (room-scale rosters only), mood has no persistence, chat tails warm one poll late on cold sessions. Deferred: pedestrian NPCs, repair loop, damage-affecting gameplay, per-visit reasons.
