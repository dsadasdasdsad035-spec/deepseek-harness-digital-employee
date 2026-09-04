## Why

The MCP tab of the market page only accepts signed ZIP packages. A user who wants to connect one remote MCP endpoint (or one local stdio server) must first obtain the publisher toolchain, build, sign, and upload an archive. Direct configuration maintenance in the Web client removes that entire detour while reusing the marketplace's credential-reference and naming machinery.

## What Changes

- Add a direct-configuration maintenance surface next to the ZIP uploader in the market MCP tab: create, edit, list, and delete user-declared MCP servers without a package.
- Support both transports in the maintenance surface: `streamable-http` (url + headers) and `stdio` (command + args + env) with the same interpreter-allowlist and scrubbed-environment rules as packaged stdio servers.
- Apply the changes immediately through `McpClientManager` hot mount/unmount; no Host restart is required for direct-config mutations (packaged packages keep their restart model).
- Reuse the marketplace credential-reference mechanism: header slots (HTTP) and env slots (stdio) hold empty fixed values plus a reference name; resolved values are never persisted, returned, or logged.
- Require the explicit local-execution confirmation on the save path when a stdio server is created or edited into existence; edits to existing stdio entries re-confirm.
- Enforce server-name uniqueness across direct-config entries and managed packages with structured diagnostics on conflict.
- Store direct-config entries in a new Host-side durable, credential-reference-only store owned by the MCP market service; entries survive restarts and remount on Host composition.

## Capabilities

### New Capabilities

- `mcp-direct-config`: user-declared (unpackaged) MCP server configuration maintained from the market MCP tab: CRUD over the config store, hot mount/unmount through the client manager, credential-reference slots, stdio local-execution confirmation, and name-uniqueness diagnostics.

### Modified Capabilities

- `mcp-marketplace`: the inventory and naming requirements now span direct-config entries as well as managed packages; server-name uniqueness diagnostics must cover conflicts in both directions (a package install colliding with a direct-config name and vice versa).

## Impact

- `packages/mcp/mcp-market` — new direct-config store and service operations; descriptor-independent mount path through `McpClientManager`.
- `packages/mcp/mcp-client` — no schema change expected; the manager already accepts both transport configs and dynamic mount. Hot unmount/re-edit semantics may need a manager capability for replacing a live server under a stable name.
- `packages/client/ui-skill-market` — `McpPanel` gains the maintenance form/table beside the existing `Uploader`; bilingual locale keys; snapshot coverage for the assembled page.
- `packages/host/digital-employee-management` — gateway wiring for the new operations and inventory merge.
- Docs: `packages/mcp/mcp-market/README(.zh).md`, config catalog, and the existing feature Agent Note gain the direct-config contract.
