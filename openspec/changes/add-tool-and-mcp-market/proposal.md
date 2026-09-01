## Why

Digital employee authors must currently know exact registered skill, Tool, and MCP client names and enter them as JSON. The existing Skill Market solves discovery and installation only for skills, leaving tools and MCP integrations without a user-facing acquisition path or a safe selector in template configuration.

## What Changes

- Add a Tool Market that lists signed, versioned tool packages and supports ZIP upload, validation, install, upgrade, uninstall, and installed-state reporting in the user tool directory.
- Add an MCP Market that lists signed, versioned MCP client packages and supports ZIP upload, validation, install, upgrade, uninstall, credential-reference setup, and installed-state reporting in the user MCP directory.
- Reuse the existing Skill Market as the skill installation source and present all installed, currently resolvable assets through a unified marketplace inventory.
- Replace free-form capability and MCP-reference entry in the digital employee template editor with searchable multi-select controls for installed skills, registered tools, and configured MCP clients.
- Keep raw JSON only for advanced expert, memory-seed, and policy authoring; never expose resolved credential values in the marketplace or template UI.

## Capabilities

### New Capabilities

- `tool-marketplace`: Discover, inspect, validate, and manage installed versioned Tool packages from trusted ZIP artifacts.
- `mcp-marketplace`: Discover, inspect, validate, configure, and manage installed versioned MCP client packages without persisting credential values.
- `marketplace-template-catalog`: Provide the administrator configuration studio with a resolvable, permission-aware catalog of installed skills, tools, and MCP clients for selection.

### Modified Capabilities

- `digital-employee-configuration-studio`: Replace manual capability and MCP name entry with administrator-selectable installed assets while retaining validation before preview and publication.

## Impact

- Affected packages: the existing skill-market Host/Web client, new Tool/MCP marketplace Host and Web packages, `dsh-mcp-client`, the tool registry, API remotes, digital employee management Host, and `ui-digital-employees`.
- Affected storage: private user marketplace directories, install manifests, MCP credential-reference configuration, and existing template drafts/publications.
- Affected security controls: archive validation, package identity/version checks, install atomicity, capability availability checks, credential-reference-only handling, and explicit template authority grants.
