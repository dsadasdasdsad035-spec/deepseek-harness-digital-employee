## Why

The company console shipped with two separate sidebar entries (Digital employees, Companies) that compete for the same organizational mental model, and its 3D scenes render every company identically — one beige box house on one green campus, with no visual identity per company. Owners want one navigation home for the organizational surface and per-company visual personality in both 3D layers.

## What Changes

- Merge the two sidebar footer entries into one 「组织」(Organization) dropdown owned by `ui-companies`: menu items 「公司」(opens the company console overlay) and 「数字员工」(closes the overlay and opens the existing digital employee workspace through `ctx.layout.openApplication()`). The standalone `ui-digital-employees` footer entry is removed; the workspace itself is unchanged.
- Add a company skin system: each company record gains its own `skinId` (per-company isolation, absent means the default), picked from a shipped catalog of five preset styles — 现代 (modern, default), 中式庭院 (courtyard), 科技霓虹 (neon), 田园木屋 (cottage), 玻璃幕墙 (glass).
- Drive both 3D layers from the skin: campus houses (body/roof shapes and colors, sky and ground palette, per-style decorations such as lanterns, neon edges, trees, or glass material) and the office interior (floor and carpet palette, desk style, screen and lighting mood) all follow the company's selected skin, so different companies look different at a glance.
- Add a skin picker to the console's company panel: preset cards with palette previews; selecting one persists `skinId` through the existing update remote and hot-swaps the scene visuals without a reload.
- Keep the light template reading: a default skin applies to new companies and to records without one; no copyable template-company entity is introduced.

## Capabilities

### New Capabilities

- None.

### Modified Capabilities

- `company-management`: 公司记录管理 gains the per-company `skinId` field — stored per company, defaulting to the shipped default skin, settable through the update remote, carried by list/detail/floor payloads; storage parses its absence as the default.
- `company-3d-console`: 公司工作区入口 becomes the merged 「组织」 dropdown entry (replacing two standalone buttons); 三维公司园区场景 and 三维公司内部场景 render per-company skin-driven visuals; a new 皮肤选择与热换 requirement covers the picker and no-reload visual swap.

## Impact

- `packages/core/company` (`CompanyRecord.skinId?`, wire types), `packages/core/company-file` (optional-field parse), `packages/host/company-management` (`update` accepts `skinId`; payloads carry it) — small additive host changes, typert regeneration included.
- `packages/client/ui-companies`: skin catalog + parameterized scene builders (`buildHouse`/`buildDepartmentZone` become skin-driven, per-style procedural decorations), skin picker UI, and the 「组织」 dropdown nav (click-popup pattern with outside-click dismissal); `packages/client/ui-digital-employees` loses its footer nav registration only.
- Tests: company-file parse round-trip with/without `skinId`, gateway update/floor carry, the existing assembled snapshot gains a skinId acceptance line; the merged menu is covered by the console's live verification plus any existing nav-referencing snapshot updates.
- Docs: both package READMEs, the Agent Note, and regenerated catalogs after service/event surface changes (none expected beyond config/catalog rows already present).
