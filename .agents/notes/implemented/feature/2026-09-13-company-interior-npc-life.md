# Agent Note: Company interior NPC life (wandering employees)

Status: implemented

English | [中文](2026-09-13-company-interior-npc-life.zh.md)

## Problem

Bound employees rendered as permanently seated figures — idle and busy differed only by chips, screens, and a bob. The user wants living employees: idle ones leave their desks to wander the office (tea/water, smoking area, toilet, lounge) and a working employee walks back to the desk and sits. Working stays defined by the existing busy derivation (running chat session or a fresh autonomous-task write) — explicitly not redefined.

## Decision

- **Persons are independent NPC groups; desks stay static.** `buildDepartmentZone` keeps desks/screens/bind-hints at seats and hands `{member, seat(local), screen}` plans to the caller; `setFloor` spawns world-space persons (`buildPerson`: torso/head/name/status chip; member raycast moved to the person, seat raycast stays with the desk; everyone starts seated with a sunk-Y seated posture).
- **Walks route through the corridor and room doors.** `beginWalk` builds axis-aligned waypoints: leaving a room passes its door gap (`door = room center ± (ROOM_D/2+0.5)` on the hall side), hall travel runs along the corridor z-line, entering a room comes through its door then to the seat. Collinear legs collapse; NPCs never cut through room walls.
- **Behavior is a per-member time-based state machine in the render loop** (`advanceNpcs`, replacing the old memberMeshes bob): `sit` (busy bob; idle waits `nextDecisionAt` then 55 % walks to a random amenity anchor), `walk` (1.7 u/s, oriented to the waypoint), `amenity` (dwell 3–8 s with a subtle sway; then 30 % chain to another amenity, else return). `updateBusy` flips the chip and the plan: busy anywhere walks straight home (screen lights on arrival); idle releases the wander clock. The floor exposes `floorHallZ` and `floorAmenities` anchors.
- **The front band gains 厕所 and 吸烟区.** Pieces are now [总裁办公室][茶水区][休息区][厕所][吸烟区] (11/8/10/6/6 with CEO; 10/12/7/7 without). Toilet: stalls with door plates and a sink counter; smoking: bench, ashtray stand, plant. Both labeled, both walkable anchors, no raycast targets.

## Alternatives considered

- **Full pathfinding graph** — the plan is a corridor with door gaps; explicit door-aware L-paths are smaller and visually correct.
- **Server-driven positions** — positions are pure presentation derived from the already-streamed busy flags; nothing to persist or log.
- **Animation rigs** — capsule figures with sink/stand postures and bobs keep the scene's procedural, no-asset style.

## Consequences

Pure client rendering change; busy semantics, remotes, and snapshots untouched. Live check: the floor loads through the full NPC-spawning chain with both companies and no error; the visual pass (wandering, busy walking home, toilet/smoking labels) is on the user's screen — the IAB tab's occlusion suspends `requestAnimationFrame`, so programmatic capture of a perpetually animating canvas wedges. Known limitations: NPCs don't avoid each other; refresh re-seats everyone; amenity dwell is untimed randomness (no schedule). Deferred: coffee-carrying props, seated typing pose, lunch-hour surges.
