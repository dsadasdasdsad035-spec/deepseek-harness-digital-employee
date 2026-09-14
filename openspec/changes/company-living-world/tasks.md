# Tasks: company-living-world

## 1. Entity registry and collision

- [x] 1.1 `scene.ts`: EntityRegistry (id/kind/position/halfExtents/destructible); static fixture registration threaded through the builders (interior furniture, doors, desks, computers; campus fixtures optional)
- [x] 1.2 Car-following on the road graph: per-edge leader gap, decelerate/halt; no pass-through (unit-testable planner where feasible)
- [x] 1.3 NPC locomotion collision: next-step AABB probe against statics (slide, then re-plan), NPC-NPC yield + encounter counting
- [x] 1.4 Deterministic collision unit tests over a mini plan (blocked slides, yields, car gaps)

## 2. Durable whereabouts (company-presence)

- [x] 2.1 Host store `whereabouts.json` (lock pattern, capped visits) + `companyGroups`-adjacent remotes `reportEmployeeVisit` / `employeePresence` on the companies gateway; typert regen + sync spec
- [x] 2.2 Unit tests: report caps, read shape, cross-process lock
- [x] 2.3 Client reports amenity arrivals (debounced per visit) from the NPC state machine

## 3. Moods and visual damage

- [x] 3.1 NPC mood value: crowding/blocked accumulation, time decay, head chip when irritated+
- [x] 3.2 Destructible fixture states intact → damaged → destroyed (tilt/smoke/topple), furious-pass kick trigger; resets on refresh
- [x] 3.3 Unit tests for the mood accumulator and damage advance

## 4. Bound computers

- [x] 4.1 Host: employee latest-session tail (trailing assistant texts) in the floor payload, refreshed on the busy poll
- [x] 4.2 Client: canvas-texture chat panel beside the busy screen per seated member; destroyed screen shows static
- [x] 4.3 Snapshot: extend the company-console rail with a visit report/read + screen-tail acceptance line

## 5. Gates, docs, verification

- [x] 5.1 Gates: typecheck, lint, unit tests, company-console snapshot replay, hygiene, doc-sync (new capability/event catalogs + zh)
- [x] 5.2 Live verification: cars queue without pass-through, NPCs yield and route around furniture, visit history survives refresh, furious NPC vandalizes, bound screens show real chat
- [x] 5.3 Docs: READMEs, Agent Note, tasks checked, `openspec validate`, commit/archive/push
