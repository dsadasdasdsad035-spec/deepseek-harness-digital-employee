# Proposal: company-interior-rooms

## Why

The company interior currently renders departments as open carpet zones on one flat floor — it reads as an open-plan office without architecture. Owners expect a roomed floor plan: an entrance door (大门), an enclosed CEO office (总裁办公室), department offices as partitioned rooms, and shared amenity areas (休息区 rest area, 茶水区 pantry) — the standard mental model of a company office.

## What Changes

- `packages/client/ui-companies` `scene.ts`: replace the open zone grid in `setFloor` with a deterministic roomed floor plan — perimeter waist-height walls with a south entrance gap, double glass entrance doors, a corridor band, one partitioned office room per department (door gap facing the corridor), an enclosed glass-walled CEO office for the 总裁 department, and fixed 茶水区 / 休息区 amenity fixtures.
- `packages/client/ui-companies` `skins.ts`: two new office-layer parameters (`wall`, `fixture`) so partitions and amenity furniture follow the company's skin.
- No host, data, remote, or wire-type changes; seat/member interaction targets and busy presentation are unchanged.

## Capabilities

### Modified

- `company-3d-console`: the 三维公司内部场景 requirement gains the roomed floor plan (entrance, CEO office, department rooms, pantry, rest area) while keeping seat derivation and status semantics.
