# Agent Note: Company floor walkers advance or re-plan instead of deadlocking

Status: implemented

English | [中文](2026-09-15-company-floor-walker-deadlock.zh.md)

## Problem

In the roomed office interior, some employee NPCs froze permanently mid-corridor: they never reached their desk or an amenity, and their internal `path` array grew without bound. Measured on a clean instance with no task running:

```
8 samples over 5.6s for one NPC
  position    (-1.7422, -2.6905)   unchanged
  pathIndex   0                    never advanced a waypoint
  path.length 12905 -> 14089       ~+170 per 700ms
  blockedSteps 0 / mood 0          the give-up branch was never reached
```

A second instance sat idle ~6 min and reached `path.length` 82955. Roughly two or three of five NPCs were in this state at any time.

Three defects stacked in `advanceNpcs` (`packages/client/ui-companies/src/client/scene.ts`):

1. **Detour viability checked only endpoints.** `ownClear(sidePoint) && ownClear(pastPoint)` tested the two new points, never the leg from the walker's current position to `sidePoint`. A detour whose entry leg was blocked was adopted anyway.
2. **The detour branch refreshed `lastAdvanceAt = time` without moving.** The 3-second stalled-walker watchdog (`if (time - npc.lastAdvanceAt > 3) re-plan`) was therefore satisfied every frame and never fired.
3. **The detour branch also reset `blockedSteps = 0`.** The `>=4` blocked retreat/re-plan branch, and the mood/vandalism logic that hangs off it, were unreachable.

Together: endpoints looked clear -> adopt a detour -> prepend two points -> the leg is actually blocked -> repeat forever.

This violated the existing `company-3d-console` requirement that a blocked walker "slides around or re-plans without entering furniture". It was pre-existing on main (`scene.ts` last touched by `f29f24729e`) and reproduces with no task at all.

## Decision

- **Validate the whole leg, not the endpoints.** Added `EntityRegistry.segmentBlockingFixture(from, to, halfExtents, ...ignore)`, which probes the segment at `SEGMENT_PROBE_STEP` (0.15) spacing — smaller than the smallest fixture, so no sliver is skipped. A detour is adopted only when both legs (current → side, side → past) are clear.
- **Key the watchdog on real displacement.** `lastAdvanceAt` is stamped only in the branches that actually move the walker (waypoint arrival, clear step, an applied retreat). An untraversable frame leaves it alone, so a genuine stall reaches the existing 3-second re-plan.
- **Count untraversable frames.** When no detour fits, the frame increments `blockedSteps` and mood; at the limit the walker retreats perpendicular (when a side step is clear) or re-plans to its desk. This bounds path growth at the threshold and restores the give-up and mood/vandalism behaviours to their designed reach.
- **Extract the decision as a pure function.** `resolveBlockedStep(input, context)` returns the adopted detour, updated counters, and any retreat/re-plan order. `CompanyScene` needs a real `WebGLRenderer`, so the walker invariants could not otherwise be tested in node; the pure function makes them ordinary unit tests.
- **Fix the room test and the walk-home route (D5-D7, found in follow-up).** The first three fixes stopped the unbounded growth but not the failure to reach the desk: `beginWalk`'s `inRoom = distance < ROOM_D/2 + 1` (radius 6) misjudged a walker standing just outside the CEO glass wall as "inside", routing it straight through the wall; and the door-fallback route unconditionally stepped to `(from.x, hallZ)` first, so a walker already inside was sent back out to the hall — and the "to desk" path even appended `(target.x, hallZ)` after reaching the seat, pulling it back out again. Combined with `updateBusy` re-issuing `beginWalk` on every busy render, this produced an oscillating walker that never sat down. Fixed: `inRoom` is now the room footprint (`|Δx| ≤ ROOM_W/2 && |Δz| ≤ ROOM_D/2`); routes are side-dispatched and monotone (`insideToDesk` / `outsideToDesk` / `insideToOutside` / `outsideToTarget`); the "to desk" path ends at the seat; `updateBusy` no longer resets a walker already heading home.

## Alternatives considered

- **Add a hard path-length cap as the fix.** It would stop the growth but leave the walker standing still forever — masking the defect, not fixing it. Rejected; the root cause is the viability test and the accounting.
- **Global pathfinding (navmesh / A*).** The defect is a wrong judgement plus wrong accounting on a working local strategy; a rewrite is far larger than the bug. Rejected.
- **Only tighten the endpoint check.** Rejected: sampling the segment is what actually distinguishes "clear endpoints, blocked middle".

## Consequences

Verified in the built app on a live instance: the same walker that used to freeze (`c62a1e86`) reached `sit` at its own desk within 20 seconds, another reached an amenity dwell, a third re-planned to a new destination, and every NPC's `path.length` stayed at 2-6 (previously 12905 -> 82955). Package tests cover the segment probe (blocker between clear endpoints, clear segment, ignored own-desk), and the pure resolver's four outcomes plus a 200-frame stalled loop asserting no detour is ever adopted, re-plans occur, and mood stays capped.

The follow-up (D5-D7) is verified end to end with a real long task: a self-contained 8000-word permission-system assignment kept `busy=true` for 28+ seconds, during which the walker traced `(-16.26, 0) → (-20.20, 0.13) → (-20.20, 6.94) → (-21.40, 7.09) → (-22.78, 7.09) → (-23.30, 7.59) sit scr=0.9` — through the door gap, across the room, to the seat, screen lit, no reversal, no door-gap oscillation. A unit test encodes the CEO geometry: the straight cut is rejected and the door route is clear.

Two honest limits on the verification:

- **The in-app browser suspends `requestAnimationFrame` when its pane is occluded**, which stops the scene loop entirely; a frozen-looking sample then reflects the browser, not the product. Both the pre-fix and post-fix live readings were taken with a `rafAlive` / `clock.elapsedTime` gate so a suspended scene can never be misread as a deadlock. When a screenshot was needed despite the suspension, I forced one frame with `scene.renderer.render(scene.floor, scene.camera)` and read the buffer in the same turn — that yields real WebGL pixels without rAF.
- **The visual result was observed through the scene object's state, not by looking at pixels** — the model doing this work has no image input. Screenshots were saved to disk (`/tmp/perm-closeup.png`, `/tmp/perm-wide.png`) for the user, who can confirm visually.

## Problem space left open

- The local detour strategy is unchanged; a walker boxed in on all four sides still relies on the retreat/re-plan path rather than searching for a route.
- Whether a hard path-length invariant should also exist as defence-in-depth (the accounting fix already bounds growth) — left to a future review.
- `updateBusy` is still called on every busy render even when it now no-ops; a dirtier trigger (only on the false→true edge) would remove the remaining redundant re-entry.
