## Why

Template configuration currently decides Skill availability from the Host-global registry, while real digital employees mount Skills through their selected Agent preset's scoped composition. Marketplace-installed and local filesystem Skills can therefore appear installed but remain unselectable even though the chosen preset would load them at runtime.

## What Changes

- Resolve the template Skill catalog through the draft's selected Agent preset rather than the unscoped Host registry.
- Add a side-effect-contained preset preview lifecycle that mounts the selected preset under a temporary scope without creating a Session, publishing an Agent, or running model work.
- Merge the preset-scoped runtime Skill catalog with marketplace installation metadata by stable Skill name.
- Reload Skill availability when the administrator changes the draft preset.
- Preserve selected Skills that become unavailable after a preset change so they remain visible and removable, while blocking validation and publication until resolved.
- Return an explicit diagnostic when a preset is missing, invalid, or cannot be previewed instead of silently falling back to the Host-global catalog.
- Replace the assembled Web test's manual Skill registration with a real marketplace installation and real preset-scoped filesystem discovery.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `template-skill-catalog`: Make the selected preset's scoped Skill composition authoritative for availability and define the preset preview lifecycle and failure behavior.
- `digital-employee-templates`: Require preset-aware catalog refresh, removable selections invalidated by preset changes, and publication validation against the selected preset.

## Impact

- Digital employee management Remote request and client-safe asset projection.
- Agent preset resolution and scoped mount lifecycle.
- Skill registry scope queries and filesystem Skill discovery.
- Template configuration store, preset selector, loading and diagnostic states.
- Host, preset, client component, keyless snapshot, and Web E2E coverage.
- Bilingual digital employee, preset, and Skill marketplace documentation.
