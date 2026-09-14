# Tasks: company-solid-collision

## 1. Solid walls

- [x] 1.1 Wall segment registration: `buildWallRun`/`buildWallWithDoor` emit segment descriptors; `buildRoom`/`buildPerimeter` register every segment as a non-destructible fixture (CEO glass included; entrance door panels registered, lintel ignored)
- [x] 1.2 NPC probes ignore own desk + PC (`blockingFixture` accepts an ignore set); other desks and all walls still block
- [x] 1.3 Deterministic unit tests: wall segments block, door gaps passable at gap width, own-desk ignored / neighbor desk blocks, glass wall blocks

## 2. Bidirectional traffic

- [x] 2.1 Oncoming car hold: reversed-edge closing distance below threshold → deterministic side halts until clear
- [x] 2.2 Unit-testable planner coverage: same-direction gap (existing), oncoming hold tie-break, release after clear

## 3. Multi-row rooms and deadlocks

- [x] 3.1 Back-row doors face east/west into the widened (2.6) inter-row seam; door record carries its side; `beginWalk` routes the correct first leg
- [x] 3.2 Deadlock retreat: 4 blocked steps → perpendicular retreat attempt, then re-plan
- [x] 3.3 Unit tests: seam width passable, retreat unblocks a facing pair

## 4. Gates, docs, verification

- [x] 4.1 Gates: typecheck, lint, all touched suites, company-console snapshot replay, hygiene, doc-sync
- [x] 4.2 Live verification on the user's screen: NPCs walk through doors only, slides stay inside rooms, cars queue both directions, multi-row floor opens correctly
- [x] 4.3 Docs: README line (EN/ZH), Agent Note, tasks checked, `openspec validate`, commit/archive/push
