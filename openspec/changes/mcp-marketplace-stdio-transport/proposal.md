## Why

The MCP marketplace only accepts declarative Streamable HTTP packages, so publishers of local MCP servers cannot distribute them through the market and users cannot install fully local, offline-capable MCP tooling: every market package must point at a remote URL. The Host already owns every mount primitive needed for stdio (`mcp-client` spawns child processes with scrubbed env; the shared archive/signature/file-table machinery is transport-agnostic), so the gap is confined to the descriptor schema, credential model, and activation path.

## What Changes

- MCP package descriptors accept `stdio` server entries alongside `streamable-http`; one package may declare servers of both transports.
- A `stdio` server entry declares an interpreter `command` from a Host-configured allowlist (default `node`), `args` whose workspace-relative script paths must resolve inside the signed file table, fixed non-secret `env` values, and `env` credential-reference slots.
- Credential-reference semantics generalize from headers to env: an env var backed by a credential reference must have an empty fixed value; configuration persists references only; resolved values exist only inside the mount call.
- Host activation of a `stdio` server resolves the managed package directory as `cwd`, resolves env credential references, and mounts through `McpClientManager` with `transport: 'stdio'`.
- MCP descriptors gain an optional `permissions` disclosure (`subprocess` implied by any stdio server) surfaced in list and UI alongside Tool packages.
- The `template-mcp` publisher template, regenerated market zips, transport summary surfaces, and both market gateways' tests follow the schema change.
- **BREAKING**: `mcpPackageDescriptorSchema` widens `transport` from the closed literal `streamable-http` to a discriminated union. Pre-release stance applies: old on-disk descriptors without the new fields stay valid; malformed or untrusted stdio entries are rejected at install, not migrated.

## Capabilities

### New Capabilities

(none — this extends the existing marketplace capability)

### Modified Capabilities

- `mcp-marketplace`: package inventory/lifecycle now covers stdio servers launched from signed local payloads under an interpreter allowlist; the credential-reference requirement covers env slots in addition to headers; a new requirement covers stdio permission disclosure and local-execution safety rules.

## Impact

- `packages/util/marketplace-core` — descriptor schema (discriminated transport union, args/env fields, permissions), descriptor validation rules, signature payload unchanged in shape (covered fields grow).
- `packages/mcp/mcp-market` — activation branch for stdio (cwd resolution into managed directory, env credential resolution), interpreter allowlist `Config` field, diagnostics for allowlist/path failures, list results carry transport + permission summary.
- `packages/mcp/mcp-client` — no protocol change; `McpClientManager.mount` already accepts `StdioConfig`.
- `packages/client/ui-skill-market` — transport badges, env credential-slot display, permission disclosure; template update and zip regeneration.
- `packages/tool/tool-market`, gateway specs for both markets — shared descriptor helpers and test fixtures.
- Specs/tests — `mcp-marketplace` delta; gateway spec cases for install/configure/activate of stdio and mixed packages.
