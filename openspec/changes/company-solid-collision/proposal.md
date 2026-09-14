# Proposal: company-solid-collision

## Why

NPCs still pass through walls: the living-world change registered furniture in the entity registry but never the walls themselves (room partitions, the CEO office glass, the perimeter, the entrance doors) — the path planner's door-routed legs are advisory, and the collision slides triggered by an NPC's own desk blocking it (the ignore parameter exists but no call site passes it) drift straight through unregistered walls. The same audit found oncoming cars passing through each other (the car-following gap only checks same-direction edges) and back-row department doors opening into the 1.5-unit inter-row seam instead of the corridor.

## What Changes

- `packages/client/ui-companies` `scene.ts`:
  - Walls register as fixtures: `buildWallRun`/`buildWallWithDoor` report their segment AABBs, `buildRoom` and `buildPerimeter` register every segment (door gaps stay passable by construction — segments already split around them); walls are non-destructible; the CEO glass and the entrance door panels register too.
  - NPC step probes ignore the walker's own desk and PC (`ignore` ids already derivable from the member key).
  - Car-following gains an oncoming check: a car on the reversed edge of the same street within the meeting threshold makes both hold (yield by deterministic side — e.g. the car with the larger from-node id), so cars never pass through each other in either direction.
  - Back-row rooms (departments beyond the first row) orient their door east/west into a widened inter-row corridor, so every room opens onto walkable space.
  - Corridor deadlocks: after N blocked steps the re-plan gains a side-step (perpendicular retreat) before routing home.

## Capabilities

### Modified

- `company-3d-console`: interior requirement gains solid walls (NPCs cannot enter wall AABBs; door gaps passable) and the exterior requirement gains bidirectional car anti-pass-through.
