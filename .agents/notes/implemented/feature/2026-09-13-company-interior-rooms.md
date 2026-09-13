# Agent Note: Company interior rooms (partitioned floor plan)

Status: implemented

English | [中文](2026-09-13-company-interior-rooms.zh.md)

## Problem

The company interior rendered departments as open carpet zones on one flat floor — readable as seating, but with no architecture. Owners expect the standard mental model of an office: an entrance door, rooms, and shared amenity areas (休息区, 茶水区, an enclosed 总裁办公室, plus 大门).

## Decision

- **A deterministic two-band floor plan replaces the open grid.** Back band (north): one partitioned room per department (11×10, door gap facing the corridor, up to 4 columns). Corridor band. Front band (south, west→east): the glass-walled 总裁办公室, 茶水区, 休息区. Perimeter waist-height walls (1.15 units — the orbiting camera sees over them, dollhouse convention) enclose the slab with a centered south gap carrying double glass doors ajar, posts, a lintel, a 大门 plate, and a welcome mat. All sizes derive from the department list; no layout is stored.
- **The CEO room matches by department name (总裁).** The preset seeds that name; renaming or deleting the department simply omits the room and widens the amenity areas — no arbitrary index is privileged.
- **Departments reuse `buildDepartmentZone` unchanged inside their rooms** (carpet, centered desks, seated members, header label); only the seat rows are now vertically centered in the zone. 茶水区 (counter, coffee machine, water dispenser, cups) and 休息区 (rug, facing sofas, coffee table, plants) are one-off procedural fixtures with floating labels and **no raycast `userData`**, so pointer picking still reaches only members and spare desks — walls cannot block interaction either, because the hit loop skips `userData`-less objects and continues to deeper hits.
- **Walls and amenity furniture follow the skin.** `SkinOffice` gains `wall` (partitions/perimeter, also tinting the CEO room's translucent glass) and `fixture` (sofa/counter/door accents); all five presets carry palette-matched values. Status colors stay semantic across skins.

## Alternatives considered

- **Full-height walls** — hide desks and seated employees from the default orbit angle; waist height trades enclosure realism for visibility.
- **Stored room/seat coordinates** — layout stays derived from membership (the phase-1 ruling): churn never leaves stale room data.
- **Host-configured layout** — nothing on the host consumes the plan; the client owns it, same as skins.

## Consequences

Pure client rendering change (`ui-companies` `scene.ts` + `skins.ts`); no host, data, wire-type, or snapshot-payload changes — the company-console keyless replay stays green unchanged. Live 3080 verification confirmed the roomed plan under two skins: courtyard (星桥科技 — walls, entrance, occupied glass CEO office, both amenity areas, seated employees in back rooms) and neon (云海数据 — same plan, dark walls and cyan fixtures, no小人 correct for a 0-member company). The floor camera pulls back (0, 22, 34) to frame the larger slab. Known limitation: a department with more than ~12 seats grows its carpet past the 10-deep room; desks may crowd the far wall (deferred: dynamic room depth). Deferred: amenity interactions (e.g. coffee brewing), a corridor floor strip, per-room lighting.
