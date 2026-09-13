## Context

Phase 1 shipped `ui-companies` (sidebar footer entry → `shell.overlay` console with procedural Three.js scenes; `scene.ts` hardcodes all colors and one house/desk shape) and `ui-digital-employees`' own footer entry (→ `shell.application`). `CompanyRecord` has no visual-identity field. `shell.application` stays owned by the digital employee workspace; cross-plugin value imports are bundle-purity errors, so cross-package cooperation goes through cordis services or `ctx.layout`.

## Goals / Non-Goals

**Goals:**

- One 「组织」 dropdown entry owned by `ui-companies`, opening both surfaces; no new slot kinds, no ui-sidebar changes.
- Per-company skins driven by a `skinId` on the company record, rendered entirely client-side from a shipped preset catalog; the host stores and forwards the id, nothing more.
- Both 3D layers (campus house + office interior) parameterized by one skin descriptor; per-style procedural decorations; no GLTF assets, no host-side skin registry.
- Default-skin fallback everywhere: absent field, unknown id, new companies.

**Non-Goals:**

- Host-side/plugin-extensible skin registry and `listSkins()` remotes (revisit if third-party skins matter).
- User-uploaded or user-defined skins (arbitrary palettes/textures) — presets only this phase.
- A copyable template-company entity (copying departments/fields from an existing company) — deferred; the "default" is a default skin, not a template company.
- Per-department or per-seat skin overrides.

## Decisions

### D1 · Menu merge: ui-companies owns the 「组织」 dropdown, 方案 1

One `sidebar.footer.action` registration (id `organization`, order 10) renders a button + click popup menu (the ui-commands `PopupSelectView` interaction pattern: menu grabs no focus trap, any outside pointerdown in capture phase dismisses). Items: 「公司」→ open the console overlay; 「数字员工」→ close overlay + `ctx.layout.openApplication()` (already proven by the console's detail-panel jump). `ui-digital-employees`' own footer registration is deleted in this change (same repo, both packages ours); its workspace, settings row, and composer source stay untouched.

- Rejected 方案 2 (cordis `companyConsole` service consumed by the other package): an extra service seam for two menu items.
- Rejected 方案 3 (new `sidebar.footer.menu` slot in ui-sidebar): requires seat-table + slot-catalog regeneration for a two-item menu; revisit when a third org-surface entry appears.
- Label: 「组织」/ "Organization". Avoids 「工作区」 (collides with the session-workspace concept).

### D2 · Skins live client-side; the host stores one opaque `skinId`

`CompanyRecord.skinId?: string`, absent = `'modern'`. The gateway's `update` accepts it verbatim (no validation — skins are the client's rendering domain; the host cannot validate against a catalog it does not own), and list/detail/`companyFloor` payloads carry it. The preset catalog is a const table inside `ui-companies` (`skins.ts`): id, label (zh), palette swatches for the picker preview, and the full descriptor consumed by the scene. Unknown ids render as the default (spec'd fallback).

- Rejected host-side registry (employee-template pattern): typert/gateway/snapshot surface growth for data with no model-visible face and no host decisions; `skinId` round-trips through storage untouched, like a stored preference.
- Storage compatibility: `SCHEMA_VERSION` stays 1; the field is optional and its absence parses as the default (single-user local document, one version ever — a version bump buys nothing; noted in the README limitations).

### D3 · One `CompanySkin` descriptor drives both layers

```ts
interface CompanySkin {
  id: 'modern' | 'courtyard' | 'neon' | 'cottage' | 'glass'
  label: string                    // 中式庭院 …
  preview: string[]                // picker 色板 (css colors)
  campus: {
    sky: number; ground: number
    house: { body: number; roofForm: 'pitched'|'flat'|'curved'|'glass'; roofBase: number }
    decoration: ReadonlyArray<'trees'|'lanterns'|'neon-edges'|'chimney'>
    groundStyle: 'grid'|'paved'|'snow'|'night-grid'|'reflective'
  }
  office: {
    floor: number; carpetTint: (deptColor: string) => string
    desk: { top: number; leg: number; style: 'wood'|'white'|'dark'|'glass' }
    screen: { idle: number; busy: number }   // emissive colors
    ambient: number                           // hemisphere intensity/mood
  }
}
```

Five shipped presets: `modern` (today's look), `courtyard` (white walls, dark curved roof, red lanterns, warm wood office), `neon` (night sky, emissive edges, dark desks, cool screens), `cottage` (timber + chimney + trees, log desks), `glass` (transmissive high-rise, minimal white office). Roof category hue stays semantic in every skin: the category hash tints `roofBase` within the skin's own palette.

### D4 · Scene builders become skin-driven; hot swap = rebuild the active layer

`buildHouse(company, skin)` and `buildDepartmentZone(dept, skin)` read the descriptor; per-decoration builders are small procedural groups (cone+cylinder trees, emissive sphere lanterns, edge-line neon via `THREE.EdgesGeometry`, chimney box). Selecting a skin calls `update({ skinId })` then rebuilds only the active layer (`setCampus`/`setFloor` already rebuild from scratch — reuse them; "hot swap" means no page reload, not incremental patching). `CompanyFloor`/campus payloads already flow through effects keyed on state, so a changed record triggers the rebuild naturally.

### D5 · Snapshot and verification follow phase-1 rails

The assembled company-console snapshot gains skin assertions: create with no skin → default id in floor payload; `update({ skinId: 'courtyard' })` → floor carries it (skinId is stable text, snapshot-safe). The merged menu is client-only: verified live in the browser (login → 「组织」 → both entries), and the `ui-digital-employees` nav removal is checked against anything referencing its old label (`Digital employees` footer button) in apps/web golden snapshots if present.

## Risks / Trade-offs

- [Scene parameterization churn in `scene.ts`] — the phase-1 builders were written for one look; converting them is most of the work, but stays inside one file with the descriptor as the single seam.
- [Skin fidelity vs procedural budget] — curved Chinese roofs and glass materials are approximations (stacked boxes, opacity); good enough at toy scale, and the descriptor leaves room to refine per skin without touching call sites.
- [Two UI packages touched by the menu merge] — `ui-digital-employees` loses only its footer registration; its snapshot/ARIA references, if any, get updated in the same change.
- [Picker default confusion] — the default skin card is visually marked 默认 so "default + selector" reads as a choice, not an unset state.

## Migration Plan

Additive field with tolerant parse; existing `companies.json` needs nothing. Removing the digital-employees footer button is a deliberate client behavior change shipped in the same bundle as its dropdown replacement. Rollback = revert the two client bundles; stored `skinId` values are inert without the new renderer.

## Open Questions

- Final five-preset lineup and their exact palettes (visual tuning during implementation; the descriptor makes swapping presets cheap).
- Whether the 「组织」 dropdown should also gain a third entry later (e.g. 任务台账) — no slot change needed, just another menu item.
