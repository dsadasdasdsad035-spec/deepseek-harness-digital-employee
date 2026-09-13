# Tasks: company-interior-rooms

## 1. Skin parameters

- [x] 1.1 `skins.ts`: add `wall` and `fixture` to `SkinOffice`; carry values in all five presets matching each palette
- [x] 1.2 Verify the picker previews still render (no structural change to cards)

## 2. Roomed floor plan

- [x] 2.1 `scene.ts`: room/partition builders — `buildRoom` (four walls, door gap, optional glass), perimeter walls with a south entrance gap
- [x] 2.2 `scene.ts`: entrance composition — double glass doors ajar, lintel, welcome mat, threshold plate
- [x] 2.3 `scene.ts`: amenity fixtures — 茶水区 (counter, coffee machine, water dispenser, cups) and 休息区 (rug, facing sofas, coffee table, plant) with floating labels, no raycast targets
- [x] 2.4 `scene.ts`: `setFloor` layout engine — back band department rooms (≤4 columns), corridor, front band 总裁办公室 (name-matched) + 茶水区 + 休息区; adaptive floor slab and reframed floor camera

## 3. Verification

- [x] 3.1 Interaction invariants hold: seated member click opens detail, spare-desk click opens bind picker, busy flip animates without scene rebuild
- [x] 3.2 Live verification on 3080: roomed plan renders per skin (default + one other), CEO room glass + nameplate, entrance doors visible, amenity areas labeled

## 4. Gates and docs

- [x] 4.1 Gates: typecheck, lint, company-console snapshot replay, doc-sync, hygiene
- [x] 4.2 Docs: ui-companies README (EN/ZH) interior description, Agent Note, tasks checked, `openspec validate`
