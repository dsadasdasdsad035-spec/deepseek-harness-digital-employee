# Design: company-living-world

## Context

`scene.ts` owns the campus (12 road-graph cars, 4 rail runs, districts) and the interior (roomed plan, wandering NPCs via corridor L-paths). Positions update per frame but nothing registers boundaries, nothing collides, and no state about the world survives refresh except the durable company/employee stores.

## Goals & Non-Goals

Goals: registered entities with mutual collision; durable per-employee visit history proving instance continuity; collision-fed moods with visual vandalism; computers bound to employees showing their real chat tail.

Non-Goals: general physics engine, durable furniture damage, gameplay consequences of damage, vehicle trajectory persistence (refresh-random by design), replay.

## Decisions

### D1. One client-side entity registry; collision strategies per entity class

`EntityRegistry` (per scene instance): `{id, kind, position, halfExtents, destructible?}`. Static fixtures register at build time (builders return their registrations); dynamic movers/NPCs refresh positions each frame. Collision is three narrow strategies, not a solver: cars use an edge-local car-following gap (leader within distance → decelerate; never overtake on an edge); NPCs probe their next step against static AABBs (blocked → slide along, then give up and re-plan) and against other NPCs (slow/step aside, count the encounter); rails need nothing (separate tracks). Furniture AABBs come from the same constants that build them.

### D2. Whereabouts are durable, positions are not

A new host store `whereabouts.json` (`$DSH_HOME/digital-employees/`, the task-events lock pattern) maps `employeeId → { lastSeenAt, lastPlace, visits: [{place, at}] }` capped at the latest 50. The client reports each amenity arrival (`reportEmployeeVisit`); `employeePresence(employeeId)` reads history. Rationale: the instance is already durable — this makes its continuity visible and queryable ("8 visits to the smoking area this week") without logging positions into session events (positions never enter model requests; a per-visit record is coarse, cheap, and human-meaningful). Places are the plan's amenity anchors (工位/茶水区/休息区/厕所/吸烟区/大门), not raw coordinates.

### D3. Moods are runtime, fed by crowding, expressed as vandalism

Each NPC carries `mood: 0..100` (0 calm). NPC-NPC encounters and blocked steps add small amounts; time decays it. Above a furious threshold, the next pass beside a destructible fixture triggers one kick: the fixture advances intact → damaged → destroyed (purely visual: tilt, dark smoke puff, toppled). No gameplay effects, no repair loop, resets on refresh. Mood shows as a small head chip when irritated or worse.

### D4. Computers bind to employees and show their real conversation tail

Desk computers already render a busy screen for the seated member; binding adds a second canvas-texture panel beside it scrolling that employee's most recent real session messages (host: their latest session's trailing assistant texts via the existing employee-session sources; fetched with the floor payload, refreshed on the busy poll cadence). The screen is per-seat furniture registered in the entity registry (and destructible like other fixtures — a destroyed screen shows static).

## Risks / Trade-offs

- Car-following on a shared graph can produce visible queues at intersections — acceptable (it reads as traffic).
- NPC slide-vs-replan needs tuning to avoid corridor congestion; the give-up-and-replan backstop keeps it bounded.
- Visit-history writes are client-reported; a malicious client could forge visits (accepted — presentation data, same trust as the rest of the console).

## Migration Plan

Additive client scene layer + new host store/remotes; rebuild + reload. Empty whereabouts for existing employees is the normal first state.

## Open Questions

None blocking.
