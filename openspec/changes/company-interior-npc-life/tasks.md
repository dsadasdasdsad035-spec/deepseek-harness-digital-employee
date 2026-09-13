# Tasks: company-interior-npc-life

## 1. Interior additions

- [x] 1.1 `scene.ts`: 厕所 and 吸烟区 front-band cells (fixtures, labels, walkable anchors, no raycast targets); front-band widths rebalanced with/without CEO office
- [x] 1.2 Floor plan exposes amenity anchors and the corridor z-line to the NPC layer

## 2. NPC behavior

- [x] 2.1 Person figures separate from desks (world-space NPC groups carrying name + status chip); member raycast on the person, seat raycast on the desk; everyone starts seated
- [x] 2.2 Corridor-routed L-path planner (current → hall → target)
- [x] 2.3 Per-member state machine in the render loop: idle decisions (wander to random amenity, dwell 3–8 s, 30 % chain / 70 % return), busy override walks back and re-seats; seated vs walking posture
- [x] 2.4 `updateBusy` flips chip/screen AND the NPC plan

## 3. Verification

- [x] 3.1 Busy semantics unchanged (existing derivation); seat/member click targets still work
- [x] 3.2 Live verification on 3080: idle members walk amenities and sit back; flipping a session busy walks one home; toilet/smoking areas render labeled

## 4. Gates and docs

- [x] 4.1 Gates: typecheck, lint, company-console snapshot replay, doc-sync, hygiene
- [x] 4.2 Docs: ui-companies README (EN/ZH), Agent Note, tasks checked, `openspec validate`
