# Proposal: company-living-world

## Why

The 3D world is choreography, not physics: cars pass through each other, NPCs pass through each other and carry no proof of identity across refreshes, furniture has no registered position, nothing records where anyone has been, and every computer is a prop. Owners asked for a living world: every entity located with boundaries and mutual collision, employee instances with durable evidence of existence (visit history that survives refresh), mood-driven (collision-fed) visual vandalism, and computers bound to their employees displaying that employee's real conversation content.

## What Changes

- **Entity registry + collision** (`ui-companies` `scene.ts`): every dynamic entity (vehicles, NPCs) and static fixture (walls, doors, desks, chairs, computers, counters, benches) registers id/position/AABB; cars follow a car-following model (no pass-through on shared edges), NPCs are AABB-blocked by furniture and yield to each other, with NPC-NPC crowding feeding a mood counter.
- **Durable whereabouts** (new capability `company-presence`): a small host store (`$DSH_HOME/digital-employees/whereabouts.json`, capped visit list per employee) plus remotes to report visits and read history — the client reports each amenity arrival; history survives refresh, proving each instance's continuity. Vehicles keep their refresh-random spawns (by design).
- **Moods** (runtime, per NPC): calm → irritated → furious, driven by crowding/collision counts; furious NPCs vandalize a nearby destructible fixture on the way past.
- **Visual damage** (session-only, no gameplay consequences): intact → damaged (tilted, smoking) → destroyed (toppled); resets on refresh.
- **Bound computers**: each desk computer binds to its seated employee and renders that employee's recent real conversation tail (their latest session messages, canvas texture) beside the busy screen.

## Capabilities

### Modified

- `company-3d-console`: interior/exterior requirements gain the registry/collision/mood/damage/bound-screen semantics.

### Added

- `company-presence`: durable per-employee visit history with report/read remotes.
