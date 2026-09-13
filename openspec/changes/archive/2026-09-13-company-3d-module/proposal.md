## Why

Digital employee instances exist today as a flat list in the management workspace with no organizational grouping. Owners who run many employees need to organize them into companies with departments, record company facts (legal representative, address, category, promotional image), and see at a glance who is working and who is idle — a 3D visualization of companies as houses with seated employees per department turns instance bookkeeping into an at-a-glance operations view.

## What Changes

- Add companies as a first-class record binding existing digital employee **instances** (not templates): each instance belongs to at most one company and one department within it.
- Add company fields: name, free-form category label, legal representative, address (informational text, no geocoding), and an optional promotional image admitted through the existing attachment pipeline.
- Add per-company department lists seeded with presets (总裁/人力/行政/IT/销售) that owners can extend, rename, reorder, and delete; seats are derived by layout, not stored.
- Add a host-side floor/status projection that joins each bound instance with its live working state (running chat sessions over the existing WebSocket status frames, plus the autonomous task-attempts ledger) into one `busy`/`idle` verdict per seat.
- Add a Two-level Three.js web console surface: a campus of 3D company houses (size scales with headcount, roof color encodes category, promo image on a billboard, address on a sign) and a company interior with one zone per department, desks, and seated low-poly employees whose animation and status label flip in real time between "在忙" and "空闲".
- Keep bindings coherent automatically: deleting an employee instance removes its binding; deleting a department moves its members to unassigned; deleting a company unbinds all members.

## Capabilities

### New Capabilities

- `company-management`: Company records, departments, employee-instance bindings, promotional image admission, and the live per-seat busy/idle status projection exposed to the web client.
- `company-3d-console`: The web console's 3D company campus and interior presentation, department zones with derived seats, real-time busy/idle rendering over the existing WebSocket, and navigation from houses to interiors and from seated employees to instance details.

### Modified Capabilities

- None. `digital-employee-management` requirements are unchanged; the company store only consumes its instance-change and before-delete events.

## Impact

- New packages: a company types/store package (JSON document under `$DSH_HOME/companies/`, file-locked atomic writes, `SCHEMA_VERSION = 1`, following the `digital-employee-file` pattern), a host `company-management` Typert gateway (`@Remote` methods, generated typert client wired into `packages/api/remotes`), and a `packages/client/ui-companies` browser plugin (`sidebar.footer.action` entry + `shell.application` workspace).
- New third-party dependency: `three` inlined into the `ui-companies` client bundle (proceeds through the client bundle purity gate as a non-`@deepseek-ai` inline).
- Bundles: host store + gateway rows and the `dsh.client` UI row in the web-app patch layer.
- No session-log or model-visible surface changes; no agent-loop changes. Busy state is runtime-derived, never persisted.
- Testing: package tests for the store/gateway/projection, plus a keyless assembled snapshot through the real web console covering company CRUD, binding, and the 3D console output, per repo testing policy.
