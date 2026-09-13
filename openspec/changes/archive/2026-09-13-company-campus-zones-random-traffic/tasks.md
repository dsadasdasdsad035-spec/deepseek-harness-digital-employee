# Tasks: company-campus-zones-random-traffic

## 1. Zoned districts and road planning

- [x] 1.1 `scene.ts`: internal cross roads and four ring→outer connector roads drawn, forming the connected main-road network
- [x] 1.2 `scene.ts`: district builder — hedge boundary with gate gap, 小区门口 (posts/beam/区名 sign), gate→main-road stub driveway, internal spine driveway (一区..四区 quadrants)
- [x] 1.3 `scene.ts`: houses placed in district plots (2×2, donut of 8 beyond 16 companies), rotated to face the spine, scale capped to the plot, per-house stub path from spine to front door
- [x] 1.4 Empty districts still render hedges and gates (planned empty land)

## 2. Random traffic

- [x] 2.1 Road graph (ring/outer cycles, center spokes, connectors) with node/edge tables; cars wander with random next edge (no immediate backtrack), random speed and spawn
- [x] 2.2 Rail runs (tram/freight/HSR/metro) randomize direction, speed, and off-screen dwell between passes; fixed-loop mover system removed
- [x] 2.3 `animate()` campus branch drives graph cars + random rails + signal cycle

## 3. Verification

- [x] 3.1 Houses remain the only interactive objects; house click still enters the interior
- [x] 3.2 Live verification on 3080: districts with gates/driveways render; cars take visibly different routes across passes; trains vary direction/speed/timing

## 4. Gates and docs

- [x] 4.1 Gates: typecheck, lint, company-console snapshot replay, doc-sync, hygiene
- [x] 4.2 Docs: ui-companies README (EN/ZH), Agent Note, tasks checked, `openspec validate`
