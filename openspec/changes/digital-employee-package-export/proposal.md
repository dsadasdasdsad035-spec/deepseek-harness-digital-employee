## Why

Published digital employee templates are local-only. Distributing an employee to another Host requires hand-copying files. A self-contained signed employee package makes employees distributable.

## What Changes

- New `employee-package.json` format: template metadata, instructions, experts, references manifest.
- Export remote: signed zip from any published local template.
- Import remote: validates, re-registers template, reports missing market packages.
- Web: export button in studio; import in digital employees workspace.

## Capabilities

### New Capabilities

- `employee-package`: format, export with signing, import with reference validation.

## Impact

- New digital-employee-package format package; host management export/import remotes; web wiring.
