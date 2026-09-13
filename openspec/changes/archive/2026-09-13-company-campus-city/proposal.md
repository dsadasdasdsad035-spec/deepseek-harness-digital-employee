# Proposal: company-campus-city

## Why

The campus currently floats on an empty plane — company houses have no context. Owners expect the surrounding city: roads with animated traffic lights and moving cars, transit lines (tram, train, high-speed rail, metro) with running vehicles, and natural features (forest clusters, a river with bridges).

## What Changes

- `packages/client/ui-companies` `scene.ts`: a deterministic city environment around the campus houses — a two-lane ring road with lane markings and looping cars, outer grid roads with cycling traffic lights at two intersections, an at-grade tram line (ping-pong), a railway embankment with a wrapping freight train, an elevated high-speed-rail viaduct and an elevated metro line with their trains, subway entrance kiosks, a river band with road bridges, and forest tree clusters in the remaining corners.
- Animated in the existing render loop: cars/trams/trains follow waypoint paths with per-vehicle speed; traffic-light heads cycle green→yellow→red with opposite-phase intersections.
- No host, data, remote, or wire-type changes; house interaction and busy presentation unchanged.

## Capabilities

### Modified

- `company-3d-console`: the 三维公司园区场景 requirement gains the surrounding city environment (roads, signals, vehicles, rail transit, river, forest) as scene dressing with no interaction semantics.
