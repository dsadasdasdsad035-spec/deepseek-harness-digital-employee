# Design: company-campus-zones-random-traffic

## Context

After `company-campus-city`, houses still sit in one central grid and every vehicle follows a fixed waypoint loop. The user asks for real planning: districts with gates and door-to-door roads, and traffic that never plays back a scripted order.

## Goals & Non-Goals

Goals: four planned districts inside the ring; a connected main-road network (ring + cross + connectors + outer grid); gates and driveways from main road to community gate to house front doors; graph-wandering cars; randomized rail runs.

Non-Goals: pedestrian/vehicle collision, zoning rules per company (assignment is sequential), editable layouts, persistence.

## Decisions

### D1. Four fixed quadrant districts; houses fill sequentially

The ring interior splits into four 20×20 districts (一区..四区) at the quadrant centers, separated by the internal cross roads. Companies fill districts sequentially (4 houses each in a 2×2 facing the district's driveway spine; over 16 companies districts switch to an 8-cell donut around the spine). House scale caps to the plot (1.6 / 1.15) so footprints stay inside the hedge. Empty districts still render hedges and gates — planned empty land.

### D2. Gates open onto the main road; driveways reach every front door

Each district's gate sits on its center-facing edge, a stub driveway connects it to the internal cross road, a spine driveway runs from the gate to the district center, and a small path strip runs from the spine to each house's front door. Houses rotate to face the spine (billboard and address sign ride the house, so they face the driveway too).

### D3. The road network is an explicit graph; cars wander it

Nodes: 8 ring points (corners + midpoints), 8 outer-grid points, and the campus center; edges: the ring cycle, the outer cycle, four center spokes (the cross roads), four connectors (ring midpoint to outer midpoint — also drawn as roads). A car carries `{from, to, t, speed}`; at each arrival it picks a random next edge, excluding the edge it came from (every node has degree ≥ 2). Speeds and spawn points randomize per car and per edge. `Math.random` is deliberate here — liveliness is the feature; nothing downstream depends on vehicle determinism (forest offsets stay seeded).

### D4. Rail runs randomize direction, speed, and departures

Each rail vehicle (tram, freight, HSR, metro) carries `{from, to, t, direction, speed, dwell}` over its two terminus waypoints (both off-screen). At each terminus it dwells a random 0.5–3 s, then re-enters with a freshly random direction, speed (per-line range), and the fixed loop mover system is deleted (`advanceMovers`/`nextMoverIndex` replaced by `advanceRoadCars`/`advanceRandomRails`).

## Risks / Trade-offs

- Random traffic can never be replay-asserted; the runtime guarantees are structural (cars stay on drawn roads, trains on rails) and the visual pass stays on the user's screen.
- Houses cap smaller than the free-grid era (≤1.6 scale vs 2.6) — the price of plots with hedges.

## Migration Plan

Pure client rendering change: rebuild + reload.

## Open Questions

None.
