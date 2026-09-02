## Why

Template configuration currently selects skills from the runtime registry without showing whether a skill came from the marketplace or exposing the marketplace metadata administrators need to judge it. This also hides installed-but-inactive marketplace skills and makes stale template selections difficult to distinguish from selectable local skills.

## What Changes

- Merge marketplace-managed skill inventory with the runtime skill registry in the digital employee configuration asset catalog.
- Present active marketplace skills and active non-market local skills as selectable template capabilities.
- Present marketplace skills that are installed but not active as disabled entries with restart or activation guidance.
- Preserve unavailable skills already referenced by a draft so administrators can see and remove them, while preventing new unavailable selections.
- Display marketplace version, author, tags, source, and restart status in the template skill selector.
- Keep template publications bound to skill names rather than copying marketplace metadata into the immutable template.
- Add a real Web E2E scenario proving that a marketplace-installed skill appears in template configuration and can be selected after activation.

## Capabilities

### New Capabilities

- `template-skill-catalog`: Defines the merged marketplace and runtime skill catalog exposed to template configuration, including availability and marketplace metadata.

### Modified Capabilities

- `digital-employee-templates`: Requires template skill authorization to use the merged catalog, retain removable stale references, and block new unavailable selections.

## Impact

- Host digital employee management asset projection and client-safe API types.
- Skill marketplace inventory consumption by the digital employee management Gateway.
- Template configuration state and skill selection UI.
- Gateway, client component, and Web E2E coverage.
- Digital employee template and skill marketplace documentation.
