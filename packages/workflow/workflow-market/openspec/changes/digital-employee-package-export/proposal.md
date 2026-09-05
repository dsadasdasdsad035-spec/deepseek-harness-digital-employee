## Why

Published digital employee templates are local-only. Distributing an employee to another Host means hand-copying files and re-registering. A self-contained, signed employee package (template + instructions + asset reference manifest) with export and import makes employees distributable artifacts.

## What Changes

- New `employee-package.json` format: template metadata, instructions, experts, and a `references` manifest naming required market packages (skills, tools, mcp, hooks, workflows, subagents).
- Export: any published local template can be exported to a signed zip.
- Import: installing an employee package re-registers the template and reports missing market packages as actionable diagnostics (installed via the existing markets).
- Web surface: export button in the studio; import through the digital employees workspace.

## Capabilities

### New Capabilities

- `employee-package`: the employee package format, export with trust/signing, import with reference validation, and diagnostics for missing market dependencies.

## Impact

- New digital-employee-package format + signing package.
- `packages/host/digital-employee-management`: export/import remotes, web surface wiring.
- Markets: import diagnostics link to the existing market install flows.
