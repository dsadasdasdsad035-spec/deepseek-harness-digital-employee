# Agent Note: Company solid collision (walls, own-seat ignore, oncoming traffic)

Status: implemented

English | [中文](2026-09-14-company-solid-collision.zh.md)

## Problem

The user reported NPCs still passing through interior walls. The audit found the living-world registry covered furniture only: room partitions, the CEO glass, the perimeter, and the entrance doors were never registered — the door-routed path legs were advisory, and the slides triggered by an NPC's own desk blocking it (the `ignore` parameter existed but no call site passed it) drifted straight through the unregistered walls. Two more gaps surfaced: oncoming cars passed through each other (the leader gap filtered same-direction edges only), and back rows of department rooms (>4 departments) opened their south doors into the 1.5-unit inter-row seam.

## Decision

- **Walls register as non-destructible fixtures, door gaps passable by construction.** `buildRoom` emits room-local segment descriptors (side walls, back wall, and the door wall's two runs split around the gap) into a sink; the setFloor loop registers them at world coordinates (`wall-office-<i>-<n>` / `wall-ceo-office-*`). `registerPerimeter` registers the north/east/west walls and the south wall's two entrance-gap segments. The same constants that build and register mean the collision geometry matches the visual geometry exactly.
- **Own seat never blocks its walker.** `blockingFixture` accepts a rest `ignore` set; every NPC probe (step, slide, retreat) passes `fixture-desk-<key>` and `fixture-pc-<key>`. Neighbor desks and all walls still block.
- **Oncoming cars hold by a deterministic tie-break.** Beyond the same-edge leader gap, a car finds any reversed-edge oncomer whose closing distance is under 6 units; the car whose `from` node sums smaller halts that frame until the winner clears — symmetric, RNG-free, no negotiation.
- **Deep rows open sideways; blocked walkers retreat before re-planning.** Rows ≥ 1 build east/west doors (alternating by column parity) into the inter-row seam widened 1.5 → 2.6; `spawnNpcs` door points and `beginWalk` legs handle all four door sides. After 4 blocked steps (was 6) the NPC tries a probe-checked perpendicular sidestep; only a still-blocked walker re-plans home.

## Alternatives considered

- **Swept/continuous collision** — per-step AABB probes are sufficient at walking speed and frame rates.
- **Negotiated oncoming yield (both slow to half speed)** — the deterministic one-side hold is simpler, terminal-state free, and reads as realistic yielding.
- **Routing-graph changes for deep rows** — side doors reuse the existing door-point mechanism; a corridor graph would be new machinery for the same behavior.

## Consequences

Registry tests grew to cover wall segments blocking with door gaps passing, the multi-id ignore set, and glass/perimeter non-destructibility (11 in the suite, 54 across the touched packages); snapshot replay, hygiene, doc-sync, lint/typecheck/build green; the service runs the build on 3080. Motion-dependent visuals (walking through doors only, slides staying in-room, two-way queues) remain for the user's screen under the known IAB occlusion limit. Known limitations: the oncoming hold can stack queues at congested intersections (accepted as traffic); the widened seam grows multi-row slab depth slightly (visual only). Deferred: intersection signals for cars, sliding door animations, wall-aware crowd repulsion.
