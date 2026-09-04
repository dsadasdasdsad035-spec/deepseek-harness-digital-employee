## 1. Descriptor schema (marketplace-core)

- [x] 1.1 Widen `mcpPackageDescriptorSchema` `servers[]` to a discriminated union on `transport`; keep the `streamable-http` branch byte-identical; add the `stdio` branch (`command` bare name `^[A-Za-z0-9._-]+$`, `args`, `env` fixed values, `credentialReferences` over env names), and add the optional `permissions` array with the Tool enum.
- [x] 1.2 Generalize descriptor validation: credential-backed header OR env slot must have an empty fixed value; reject secret-like fixed env values (reuse the header-value check); every relative-path `args` entry must name a file in the signed `files` table; imply `subprocess` in permissions when any server is stdio.
- [x] 1.3 Extend the package-builder CLI to emit stdio and mixed descriptors (template manifest, signature payload unchanged in shape), with unit tests for each rejected-invalid case from the spec scenarios.

## 2. Market service and activation (mcp-market)

- [x] 2.1 Add the `stdioInterpreters` validated `Config` field (default `['node']`) and reject stdio descriptors whose `command` is outside the allowlist at install and at activation, with a structured failure naming the command.
- [x] 2.2 Branch `activateConfigured()` per transport: stdio resolves env credential references, composes `cwd` from the managed package directory, and mounts via `mcpClients.mount({ transport: 'stdio', ... })`; re-verify payload hashes before mounting (Tool-market parity); per-package rollback and diagnostics on failure.
- [x] 2.3 Carry transport and permission summary through list/configure/diagnostic outputs (no credential values), including the missing-interpreter and spawn-failure diagnostics.
- [x] 2.4 Update gateway spec tests: install stdio package, install mixed package, configure env references, activate across restart, reject non-allowlisted command, reject args path outside the file table, reject fixed value on credential-backed env slot.

## 3. Web UI and templates

- [x] 3.1 `template-mcp` gains a stdio variant (descriptor + `server/` entry) and the mixed-transport example; regenerate `apps/web/public/mcp-market-template.zip` and update the template catalog spec deltas if listing changes.
- [x] 3.2 `ui-skill-market`: transport badges for stdio/http/mixed, env-slot credential display, pre-install subprocess permission disclosure; update component and package-store client tests.

## 4. Verification and records

- [x] 4.1 Add a keyless snapshot through a real runnable example: install→configure→recompose→stdio server's `mcp__<server>__<tool>` visible (node-based stdio MCP server fixture replaying on macOS/Linux).
- [x] 4.2 Update both markets' READMEs (bilingual), `mcp-market` JSDoc contracts, and write the implementation Agent Note; run focused tests plus `doc-sync`.
