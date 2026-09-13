# Proposal: company-campus-zones-random-traffic

## Why

Company houses sit in one central grid with no planning, and every vehicle follows a fixed loop — the campus reads as a demo, not a city. Owners expect zoned planning: planned districts (小区) with gates, access roads running from the main road to each community gate and each house's front door; and traffic that never repeats a scripted order — cars wander the road graph, trains run with random direction, speed, and departure gaps.

## What Changes

- `packages/client/ui-companies` `scene.ts`:
  - Zoned campus: four planned districts in the ring's quadrants, each with a hedge boundary, a 小区门口 gate (posts, beam, 区名 sign) opening onto the internal main road, an internal driveway spine, and per-house stub paths to each front door; houses face their driveway and cap their footprint to the plot.
  - Road planning: internal cross roads through the campus plus four connector roads linking ring and outer grid, forming one connected main-road network the gates plug into.
  - Random traffic: cars become graph wanderers (random next edge at every intersection, random speed and spawn), trains/tram become randomized rail runs (random direction, speed, and off-screen dwell between passes) — the fixed-loop mover system is removed.
- No host, data, remote, or wire-type changes.

## Capabilities

### Modified

- `company-3d-console`: the 三维公司园区场景 requirement gains zoned district planning with gated access roads and random (non-scripted) vehicle trajectories.
