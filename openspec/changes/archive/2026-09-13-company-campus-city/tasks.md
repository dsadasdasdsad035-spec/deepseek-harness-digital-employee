# Tasks: company-campus-city

## 1. City environment

- [x] 1.1 `scene.ts`: road network — ring road with dashed lane lines, outer grid roads, road material
- [x] 1.2 `scene.ts`: rail transit — tram line (at-grade rails), railway embankment, HSR viaduct with piers, metro viaduct, subway entrance kiosks with 地铁 signs
- [x] 1.3 `scene.ts`: river band with banks and road bridges; forest tree clusters (seeded deterministic placement)
- [x] 1.4 `scene.ts`: traffic lights — pole/arm/three-lamp heads at two intersections

## 2. Vehicles and animation

- [x] 2.1 Vehicle builders: car (body/cabin/wheels/headlights), tram (two segments + pantograph), freight train (loco + wagons), HSR (nose + cars), metro (cars)
- [x] 2.2 Waypoint mover system advanced in the render loop: looping paths, tram ping-pong, train wrap; vehicles oriented nose-forward along travel direction
- [x] 2.3 Traffic-light cycle green→yellow→red with opposite-phase intersections, brighter emissives on night skins

## 3. Verification

- [x] 3.1 Houses remain the only interactive objects (city props carry no raycast userData); house click still enters the interior
- [x] 3.2 Live verification on 3080: roads/river/forest/rail render; cars, tram, trains, and metro visibly move; traffic lights cycle; day and night skins

## 4. Gates and docs

- [x] 4.1 Gates: typecheck, lint, company-console snapshot replay, doc-sync, hygiene
- [x] 4.2 Docs: ui-companies README (EN/ZH) campus description, Agent Note, tasks checked, `openspec validate`
