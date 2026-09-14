# Design: company-solid-collision

## Context

The living-world registry blocks furniture only. Walls are built by `buildWallRun`/`buildWallWithDoor` (`buildRoom`, `buildPerimeter`) with no registration; `blockingFixture` supports an `ignore` id that no NPC call site passes; the car gap filters `other.from === car.from && other.to === car.to` (same direction only); back rows of department rooms face south into the BAND_GAP seam.

## Goals & Non-Goals

Goals: NPCs physically cannot enter any wall segment (door gaps passable); own-desk blocking stops triggering slides; cars never pass through cars in either direction; multi-row rooms open onto walkable space; deterministic tests for all of it.

Non-Goals: swept/continuous collision (per-step probes stay), rotating doors, wall damage (walls stay non-destructible), car-pedestrian interaction (different layers), pathfinding graph changes beyond door orientation.

## Decisions

### D1. Wall builders return registrations; callers register into the floor registry

`buildWallRun` gains an optional sink parameter (or returns its segment descriptor) and every caller registers `kind: 'fixture'` with `destructible: false` and the segment's exact AABB (`halfExtents` from length/WALL_T orientation). `buildWallWithDoor` yields two segments around the gap — the door gap stays open by construction, matching the visual geometry exactly (the same constants build and collide). The CEO glass walls register identically (translucency is visual; solidity is physical). The entrance registers as two door-panel AABBs plus the lintel ignored (above head height) — NPCs may pass the threshold but not the closed panel bodies.

### D2. NPC probes ignore the walker's own seat furniture

The step probe passes `ignore` for `fixture-desk-<memberKey>` and `fixture-pc-<memberKey>`. `blockingFixture` currently takes one ignore id; it grows to accept a small set (own desk + own PC). Other desks and every wall still block.

### D3. Oncoming cars hold by deterministic tie-break

Extend the leader scan: for the reversed edge (`other.from === car.to && other.to === car.from`) compute the closing distance; below the meeting threshold (same 6-unit class), the car holding the lexicographically larger `from` node position halts until the oncoming car clears (its gap reopens). Deterministic (no RNG), symmetric, and terminal-state free — both sides resolve without negotiation.

### D4. Back-row doors face sideways into a widened seam

When offices span multiple rows, rows ≥ 2 build their door on the east or west wall (alternating by row parity) into the inter-row seam widened from BAND_GAP 1.5 → 2.6 (walkable: NPC diameter 0.56 with margin). Door-aware path planning already routes through the owning room's recorded door point; the door record gains its side so `beginWalk` emits the correct first leg.

### D5. Deadlock retreat before re-plan

After 4 blocked steps (reduced from 6), the NPC first tries a one-step perpendicular retreat (both directions, probe-checked) and continues; only a still-blocked walker re-plans home. This resolves two NPCs meeting in a corridor stretch with no side gap.

## Risks / Trade-offs

- Wall AABB density raises probe cost — segment count is ~40 per floor; the linear scan stays trivial.
- The oncoming hold can stack cars at intersections during congestion — accepted (reads as traffic); the threshold is a named constant.
- Widening the seam changes slab depth slightly for multi-row floors — visual-only, no data impact.

## Migration Plan

Client-only rendering change; rebuild + reload.

## Open Questions

None blocking.
