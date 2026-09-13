# Agent Note: Company skins and the merged Organization sidebar menu

Status: implemented

English | [中文](2026-09-13-company-skins-sidebar-menu.zh.md)

## Problem

The company console from the 3D module rendered every house and every office in one fixed look, and 公司 / 数字员工 occupied two separate sidebar footer buttons. Owners asked for per-company visual identity — different companies showing different decorative styles on the campus AND inside their offices, with a default plus a picker — and for the two menus to merge into one dropdown.

## Decision

- **Skin identity is per company, stored as an opaque `skinId`.** `CompanyRecord.skinId` is optional (absent means default); create/update requests carry it; `dsh-company-file` round-trips it with `SCHEMA_VERSION` unchanged. The host gateway needs no new remote — `updateCompany` passes the field through. The id is deliberately opaque at the data layer: the client owns the catalog, so adding a skin never touches host code.
- **A client-side catalog drives both layers.** `client/skins.ts` defines a `CompanySkin` descriptor (campus: sky, ground, roof form `pitched|flat|curved|glass`, decoration set `trees|lanterns|neon-edges|chimney`; office: floor, carpet opacity, desk top/leg/style, busy-screen emissive, ambient) and five procedural presets — `modern` (default), `courtyard` 中式庭院, `neon` 科技霓虹, `cottage` 田园木屋, `glass` 玻璃幕墙. `resolveCompanySkin` falls back to the default for unknown or missing ids, so stale records from a removed skin still render.
- **Hot swap rebuilds the active layer, not the page.** The picker calls `update({companyId, skinId})` then `loadFloor(companyId)`; `CompanyScene.setFloor`/`setCampus` dispose their previous groups and rebuild from the descriptor. The campus environment (sky/ground/grid) follows the first company's skin; each house renders in its own company's skin, so two companies on screen show two styles.
- **The 「组织」 dropdown lives in `ui-companies`.** One `sidebar.footer.action` registrant injects an items list (`🏠 公司` opens the overlay console, `👤 数字员工` opens the digital employee workspace through `layout.openApplication`). `ui-digital-employees` stops registering its own footer button. `ui-companies` was chosen as the owner because its console already owns the additive `shell.overlay` seat, while the employee workspace keeps its single-seat `shell.application` untouched.
- **Status colors stay constant across skins.** 在忙/空闲 chips and busy-screen reds/greens are semantic, not cosmetic; skins change desks, floors, roofs, and lighting only.

## Alternatives considered

- **A template company entity that others copy** — the user picked the lighter reading: a default skin plus a picker, not a clonable company. Skin identity stays a field on each company, so switching one company never affects another.
- **Host-side skin registry with validation** — would put cosmetic ids through three packages and a remote round-trip per change; nothing on the host consumes the skin, so an opaque string keeps the seam minimal.
- **GLTF skin packs** — no asset pipeline exists for the console and three.js is already inlined procedurally; descriptors stay in the ~1 KB-per-skin range.

## Consequences

Snapshot rails extended: the company-console driver asserts `skin-default` (absent → null) and `skin-switched` (`courtyard`) acceptance lines; `dsh-company-file` tests cover create-plain/round-trip/legacy-without-field. Live 3080 verification confirmed: merged dropdown with both entries and no standalone buttons, five picker cards, courtyard hot-swap inside 星桥科技 without reload, the campus house re-skinned (pitched roof, warm environment), two companies rendering different skins side by side (星桥科技 courtyard vs 云海数据 neon), and the 数字员工 item opening the workspace. A phase-1 carry-over bug surfaced during that pass and is fixed here: the company-info edit form kept the previous company's values after switching companies (saving would have written company A's fields into company B); `selectedId` changes now reset the edit state before the fill effect runs. Pre-existing snapshot debt observed while gating (not introduced here, left as-is): `subagent/descriptor` version 2→3 mismatches across the acp/sdk/headless replay fixtures, and a foreign workspace-instructions injection polluting some headless replays; the account-gate `/setup` redirect had also silently broken the `web-browser-open` inline snapshot's `bootManifest` expectation, which is corrected in this change. Deferred: per-skin ambient audio, skin preview thumbnails beyond palette swatches, and a user-defined skin channel.
