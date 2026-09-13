# Design: company-interior-npc-life

## Context

`buildWorkstation` bakes the person into the desk group at a fixed spot; busy flips only the screen/chip/bob. The floor plan already has 茶水区/休息区/大门 but no toilet or smoking area.

## Goals & Non-Goals

Goals: idle employees visibly live in the office (walk, dwell at amenities, sit back down); busy employees return to their desks; working stays defined by the existing busy derivation.

Non-Goals: pathfinding around every wall (corridor-routed L-paths suffice), collision between NPCs, animation rigs (capsule figures with simple bob), persisting positions (refresh resets everyone to seats).

## Decisions

### D1. Persons are separate NPC groups; desks stay static

`buildDepartmentZone` keeps desks/screens/bind-hints at seats; the person (torso, head, name, status chip) becomes a floor-level group positioned in world coordinates. Member raycast moves to the person; seat raycast stays with the desk. `updateBusy` keeps flipping the chip/screen and now also nudges the NPC's plan (busy → return-to-desk; idle → free to wander).

### D2. Corridor-routed L-paths

Each floor stores its amenity anchors (pantry dispenser, lounge sofa, toilet, smoking bench) and its corridor line (z of the hall band). A walk path is `[current → (corridor z at current x) → (corridor z at target x) → target]` — two axis-aligned legs through the hall, never diagonal through rooms. Deterministic from the plan geometry; no graph needed.

### D3. Behavior is a per-member time-based state machine in the render loop

Phases: `sit` (at desk; busy works, idle waits for the next decision), `walk` (advance along path at walk speed, oriented to the next waypoint), `amenity` (dwell at an anchor for a randomized 3–8 s, plus a subtle idle bob), then either another amenity (30 %) or back to the desk (70 %). Busy overrides: wherever the NPC is, the next plan becomes the desk; the screen lights only once seated. Seated posture is a lowered Y; walking is full height. Everyone starts seated.

### D4. 厕所 and 吸烟区 join the front band

Front-band pieces become [总裁办公室][茶水区][休息区][厕所][吸烟区] (widths 11/8/10/6/6 with CEO; 10/12/7/7 without). Toilet: stall boxes, sinks, 厕所 label. Smoking: bench, ashtray stand, 吸烟区 label. Both carry walkable anchors and no raycast targets.

## Risks / Trade-offs

- L-paths cross door gaps visually only if room doors are on the hall side — they are (south-facing doors, hall z-line passes them).
- Thirty wandering NPCs is the ceiling case; per-frame cost is trivial (vector lerps), rendering cost unchanged.

## Migration Plan

Pure client rendering change: rebuild + reload.

## Open Questions

None.
