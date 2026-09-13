# Design: company-interior-rooms

## Context

`CompanyScene.setFloor` lays departments out as an open 3-column grid of carpet zones. The user wants recognizable architecture: entrance, rooms, shared areas. Everything stays client-side and procedural; no data model change.

## Goals & Non-Goals

Goals: a roomed floor plan rendered from the same `FloorDepartment[]` input; skin-following walls and fixtures; unchanged interaction (member/seat raycast) and busy semantics.

Non-Goals: stored room/seat coordinates (layout stays derived), editable room shapes, host-side layout configuration, new snapshot payloads.

## Decisions

### D1. Layout is a deterministic two-band plan derived from departments

Back band (north): every department except 总裁 becomes one partitioned room (11×10) arranged in up to 4 columns, door gap facing the corridor. Front band (south): the 总裁 department gets an enclosed glass-walled room (总裁办公室) at the west end, then the fixed amenity areas 茶水区 and 休息区. A corridor band separates the two. The whole plan sits inside perimeter waist-height walls (1.15 units — low enough that the orbiting camera sees over them, the dollhouse convention) with a centered gap in the south wall for the entrance. When no department is named 总裁, the CEO room is omitted and the amenities widen.

### D2. The 总裁 room is matched by department name, not position

The preset seeds 总裁 as the first department; renaming or deleting it simply means no CEO room — every department is then a standard office room. Matching by name keeps the rule visible and avoids privileging an arbitrary index.

### D3. Entrance is a double glass door with a lintel and mat

Two glass panels stand ajar (rotated outward) in the south gap under a lintel bar; a darker mat plane marks the threshold. No interaction is attached — it is architecture, not a control.

### D4. Walls and amenity furniture follow the skin

`SkinOffice` gains `wall` (partition/perimeter color) and `fixture` (sofa/counter/cabinet accent). All five presets carry values matching their palette. CEO room partitions use translucent glass material tinted by `wall`. Status colors (在忙/空闲) remain semantic and constant across skins.

### D5. Fixtures are static; rooms reuse the zone builder

Department rooms and the CEO room reuse `buildDepartmentZone` unchanged (carpet, desks, seated members, header label) inside their wall boxes. 茶水区 (counter, coffee machine, water dispenser, cups) and 休息区 (rug, two facing sofas, coffee table, plant) are one-off procedural fixtures with floating labels; they carry no raycast `userData`, so pointer picking still reaches only members and spare desks.

## Risks / Trade-offs

- Big departments (more than ~12 seats) can outgrow a 10-deep room; the existing zone-depth formula already grows the carpet, so desks may approach the wall — accepted for now, noted in Known Limitations.
- Waist-height walls trade enclosure realism for camera visibility; full-height walls would hide seats from the default orbit angle.

## Migration Plan

Pure client rendering change: rebuild + reload. No persisted data, wire types, or host behavior involved.

## Open Questions

None.
