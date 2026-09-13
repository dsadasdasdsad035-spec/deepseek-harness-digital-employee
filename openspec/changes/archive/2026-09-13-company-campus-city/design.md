# Design: company-campus-city

## Context

`setCampus` renders company houses on a bare ground plane (plus a GridHelper on grid skins). The user wants the surrounding city: 马路, 红绿灯, 汽车, 电车, 火车, 高铁, 地铁, 森林, 河流.

## Goals & Non-Goals

Goals: a lively, deterministic, low-poly city environment animated in the render loop; houses remain the only interactive objects; stable performance (tens of moving groups, no assets).

Non-Goals: traffic simulation (no collision/queueing), route editing, vehicle interactions, sound, persistent state.

## Decisions

### D1. One deterministic layout on a fixed coordinate plan

The 140×140 campus ground hosts a fixed city plan: ring road (square loop, half-size 26, two lanes with dashed center lines) around the campus block; outer grid roads at ±44; at-grade tram line at z=−36; railway embankment at z=−56; elevated HSR viaduct at x=+58 (deck height 6, piers every 12); elevated metro line at x=−58 (height 4.5); river band at z∈[54,66]; forest clusters in the free corners and river banks; two subway entrance kiosks near the ring road's south side. Everything is static geometry at fixed coordinates — no procedural randomness in placement; tree cluster offsets come from a seeded LCG, so renders are deterministic.

### D2. Vehicles are waypoint movers advanced in the render loop

Each vehicle registers `{ object, waypoints, edge, t, speed }` (looping) or a ping-pong flag (tram). Per frame, `dt` advances `t` along the current edge; `object.position.lerpVectors` places it and `object.lookAt(next)` orients the nose (+Z). Vehicles are built nose-forward: car (body+cabin+wheels+headlights), tram (two linked segments, pantograph), freight train (loco+4 wagons), HSR (3 cars with stretched-sphere nose), metro (3 boxy cars). Trains wrap: reaching the last waypoint respawns at the first.

### D3. Traffic lights cycle on a fixed signal plan

Two intersections on the south outer road carry a pole+arm+three-lamp head each; lamps are emissive materials whose intensity flips on a green 5s → yellow 1.5s → red 5s cycle, the two intersections half a cycle out of phase. Signal state is a pure function of elapsed time — no scheduler.

### D4. City dressing is non-interactive and skin-ambient

City objects carry no raycast `userData`, so pointer picking still reaches only company houses (the hit loop skips `userData`-less objects). Colors are a fixed civic palette (asphalt, concrete, rail steel, river blue, greens); on night-grid skins, car headlights and signal lamps read brighter via a `night` emissive bump. The environment sky/ground still follow the first company's skin.

## Risks / Trade-offs

- Moving geometry re-renders every frame in campus view; counts stay small (~12 vehicles, ~40 static props) so the cost is negligible.
- Trains teleport on wrap; at the plan's edges (±95, outside the default camera framing) the respawn is off-screen.

## Migration Plan

Pure client rendering change: rebuild + reload.

## Open Questions

None.
