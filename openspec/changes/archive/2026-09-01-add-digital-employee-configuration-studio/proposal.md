## Why

Digital employee management currently lets users select registered templates and operate employee instances, but local administrators cannot author, validate, preview, and publish those templates through the product. A configuration studio makes employee creation approachable for users while keeping capability design and publishing under deliberate administrator control.

## What Changes

- Add an administrator-only configuration studio to the existing digital employee management Web surface.
- Add persistent template drafts containing employee metadata, main-agent instructions, expert definitions, capability references, MCP references, and memory seed policy.
- Validate drafts before preview or publication, including resource resolution, capability containment, delegation limits, MCP server-name uniqueness, and secret exclusion.
- Add isolated temporary preview composition and immutable template-version publishing.
- Make published template versions available to existing employee creation and explicit upgrade workflows.

## Capabilities

### New Capabilities

- `digital-employee-configuration-studio`: Administrator-authored template drafts, validation, preview, publishing, and version history.

### Modified Capabilities

- `digital-employee-management`: Separate ordinary employee operations from administrator-only template configuration and expose published template versions for creation and upgrade.
- `digital-employee-templates`: Support locally published immutable template versions in addition to plugin-contributed templates.
- `digital-employee-capabilities`: Validate administrator-authored capability references and prevent secrets or authority escalation in published templates.

## Impact

- Affected Host packages: digital employee management, templates, capabilities, memory, and their typed remote API composition.
- Affected Web packages: digital employee workspace navigation, management store, and configuration views.
- Affected persistence: durable template draft and local published-version records, excluding credentials and preview data.
- Affected tests: Host validation and lifecycle tests, Web composition tests, and a keyless assembled snapshot for draft-to-publish behavior.
