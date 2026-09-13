# @deepseek-ai/dsh-client-ui-companies

English | [中文](README.zh.md)

Browser-only 3D company campus console. The sidebar footer 「组织」 dropdown (owned here, with the 数字员工 item delegating to the digital employee workspace) opens a full-screen `shell.overlay` surface with two Three.js scenes: a campus of zoned districts — four planned communities (一区..四区) inside the ring, each with a hedge boundary, a gated 小区门口 whose stub driveway plugs into the main-road network (ring + cross roads + connectors + outer grid), an internal driveway spine, and a stub path to every house's front door, houses facing their driveway and capped to the plot (roof color encodes the category, size scales with headcount, promotional image on a billboard, address on a sign) — inside a living city: dashed-lane roads, cars that wander the road graph with a random next edge at every intersection, opposite-phase green→yellow→red traffic lights, a tram, a freight train, and randomized high-speed-rail and metro runs on elevated viaducts (random direction, speed, and departure dwell each pass) with 地铁 entrance kiosks, a river with road bridges, and seeded forest clusters (all dressing, never interactive); and a roomed office interior — waist-height perimeter walls with a south double-glass entrance (大门), one partitioned office room per department along a corridor, an enclosed glass 总裁办公室 for the 总裁 department at the front, and fixed 茶水区 (counter, coffee machine, water dispenser), 休息区 (rug, facing sofas, coffee table, plants), 厕所 (stalls, sinks), and 吸烟区 (bench, ashtray) amenity areas. Employees live as NPCs: idle ones leave their desks and wander corridor-routed paths between the amenities (random dwell, occasional chaining) or sit back down, while a busy flip (the existing session/task derivation) walks them straight home to light their screen. Each company carries an isolated `skinId` selecting one of five procedural skins (现代简约 default, 中式庭院, 科技霓虹, 田园木屋, 玻璃幕墙); the skin drives both layers — house form, palette, and decorations on the campus; interior slab, walls, furniture, desks, and lighting inside — and switching it in the 公司皮肤 picker hot-swaps the active scene without a page reload. Seated employees flip between 在忙 and 空闲 (chat-sourced state rides the live WebSocket session status bits; task-sourced verdicts refresh through a 5-second floor poll). `three` is inlined into the client bundle (no GLTF assets — all geometry is procedural). Clicking a seated employee opens a detail panel with a jump to the digital employee workspace; clicking an empty desk opens the bind picker for that department.

The console rides `shell.overlay` (additive) rather than `shell.application` (single seat owned by the digital employee workspace, which a second registrant could only shadow).

## Model Experience

None, as this package renders the console; it contributes no prompt content, tools, or session events.

#### KV Cache effect

None; console state never enters a model request.

## Known Limitations and Deferred Work

- **No per-seat camera framing** — clicking an employee opens the detail panel without animating the camera to their desk.
- **Billboard textures load lazily** — promo images pop in after the first campus render.
