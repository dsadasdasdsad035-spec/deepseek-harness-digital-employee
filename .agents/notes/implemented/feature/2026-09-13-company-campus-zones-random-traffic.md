# Agent Note: Company campus zones and random traffic

Status: implemented

English | [中文](2026-09-13-company-campus-zones-random-traffic.zh.md)

## Problem

Houses sat in one central grid and every vehicle played a fixed loop — the campus read as a demo. The user asked for planning: districted plots with gates, roads running from the main road to each community gate and each house's front door, and traffic that never repeats a scripted order.

## Decision

- **Four planned districts fill sequentially.** The ring interior splits into four 20×20 quadrant districts (一区..四区) separated by the internal cross roads. Each district renders a hedge boundary (the gate side splits around a 3.6 gap), a 小区门口 (posts, beam, 区名 sign) on its center-facing edge, a stub driveway to the cross road, an internal driveway spine to the district center, and a stub path to every house front door. Houses rotate to face the spine (north rows south, south rows north) so every door meets its path; scale caps to the plot (1.6 normal, 1.15 dense). Capacity: 4 per district (2×2), 6 per district (two rows of three) past 16 companies; empty districts keep hedges and gates as planned empty land.
- **The road network is an explicit graph.** Nodes: 8 ring points, 8 outer-grid points, the center; edges: ring cycle, outer cycle, 4 center spokes (the drawn cross roads), 4 connectors (ring midpoint → outer midpoint, drawn as roads). District gates plug into this network via their stubs.
- **Cars wander the graph.** A car carries `{from, to, t, speed}`; at each arrival it picks a random next edge, excluding the edge it arrived on (every node has degree ≥ 2); speed re-rolls per edge (3.5–8). Twelve cars spawn on random edges at random `t`. `Math.random` is deliberate: liveliness is the feature and nothing downstream depends on vehicle determinism (forest offsets stay seeded).
- **Rail runs are randomized passes.** Tram/freight/HSR/metro carry `{from, to, t, direction, speed, dwell}` over off-screen termini; at each end they dwell a random 0.5–3 s, then re-enter with a freshly random direction, speed (per-line range), and start. The fixed-loop mover system (`advanceMovers`/`nextMoverIndex`) is deleted; `animate()`'s campus branch now drives `advanceRoadCars`, `advanceRandomRails`, and the signal cycle.

## Alternatives considered

- **Per-company zoning rules or drag-and-drop plots** — assignment is sequential for now; editable layout is a separate feature.
- **Keeping deterministic loops with random-looking offsets** — the user explicitly rejected scripted order; true random walks were cheap once the graph existed.

## Consequences

Pure client rendering change (`scene.ts`); the company-console keyless replay stays green (payloads unchanged). Live 3080 check: the console loads through the full district-building chain with both companies (a throw would unmount the overlay); the visual pass (gates, driveways, wandering cars, randomized trains) is on the user's screen, as IAB tab occlusion suspends `requestAnimationFrame` and wedges programmatic capture. Houses cap smaller than the free-grid era (≤1.6 scale) — the price of hedged plots. Deferred: pedestrians, gate animations, rush-hour speed patterns, company-driven zoning rules.
