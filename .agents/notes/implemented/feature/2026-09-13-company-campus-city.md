# Agent Note: Company campus city (roads, signals, transit, river, forest)

Status: implemented

English | [中文](2026-09-13-company-campus-city.zh.md)

## Problem

The campus floated on an empty plane — company houses had no context. The user asked for the surrounding city: 马路, 红绿灯, 汽车, 电车, 火车, 高铁, 地铁, 森林, 河流.

## Decision

- **One deterministic city plan on fixed coordinates.** Ring road (square loop, half 26, two dashed lanes) around the campus block; outer grid roads at ±44 (vertical roads stop at the river bank; bridges carry them across); at-grade tram line at z=−36; railway embankment at z=−56; HSR viaduct at x=+58 (deck height 6, piers every 12); metro viaduct at x=−58; river band z∈[54,66] with banks and two bridges; 地铁 entrance kiosks near the ring's south side; seven tree clusters whose offsets come from a seeded LCG (no `Math.random`, renders are deterministic).
- **Vehicles are waypoint movers advanced in the render loop.** `{object, waypoints, edge, t, speed, pingPong, direction}` — cars loop the ring and grid corners, the tram ping-pongs its line, the freight train / HSR / metro wrap edge-to-edge (respawn is outside the default camera framing at ±95). Vehicles are built nose-forward along +Z; `position.lerpVectors` places, `lookAt(next)` orients. `animate()` now takes one `clock.getDelta()` per frame (`elapsedTime` still drives the busy bob), movers and signal lamps only update in the campus view.
- **Traffic lights are a pure function of elapsed time.** Two intersections on the south grid road carry pole/arm/three-lamp heads; lamp materials flip emissive intensity on a green 5 s → yellow 1.5 s → red 5 s cycle, the two heads half a cycle out of phase. Night skins read brighter through headlight/lamp emissive bumps.
- **City dressing is never interactive.** No city object carries raycast `userData`, so pointer picking still reaches only company houses (the hit loop skips `userData`-less objects); house clicks still enter interiors.

## Alternatives considered

- **Traffic micro-simulation** (queues, collisions) — the request is atmosphere, not simulation; movers on fixed paths deliver visible life at negligible cost (~12 moving groups).
- **Random placement** — deterministic coordinates and a seeded LCG keep renders reproducible and testable.
- **Skin-colored city** — the civic palette (asphalt/concrete/rail/river/greens) reads better against every skin than tinted roads would; only ambient light and emissives follow the night skins.

## Consequences

Pure client rendering change (`scene.ts` only); no host, data, wire-type, or snapshot-payload changes — the company-console keyless replay stays green. Verification: the panel loads both companies through the full `setCampus` chain on the live 3080 service (a runtime throw would have unmounted the overlay); pixel sampling and screenshot capture could not be completed programmatically because the in-app browser tab was occluded (occlusion suspends `requestAnimationFrame` — frames freeze, capture wedges), so the visual pass (moving cars/trains/tram, cycling signals, river/forest) is the user's screen. Known limitations: cars turn square corners instantaneously; trains teleport on wrap (off-screen); vertical grid-road lane dashes skip the river span. Deferred: pedestrians, day/night lamp windows, ambient sound.
