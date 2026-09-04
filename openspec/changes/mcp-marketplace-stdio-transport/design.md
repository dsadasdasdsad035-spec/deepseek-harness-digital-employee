## Context

`mcp-market` today mounts only declarative Streamable HTTP packages: the descriptor schema (`marketplace-core/src/descriptors.ts`) closes `transport` at the literal `streamable-http`, credentials map header→reference, and `activateConfigured()` in `packages/mcp/mcp-market/src/index.ts` resolves headers and calls `mcpClients.mount(...)`. The mount primitive for stdio already exists and is unchanged by this work: `dsh-mcp-client` accepts `StdioConfig` (`command`, `args`, `env` merged over `scrubbedParentEnv()`, `cwd`), spawns via the MCP SDK, and registers remote tools as `mcp__<serverName>__<rawName>`. Shared archive validation, the signed SHA-256 file table (≤256 files), publisher-trust verification, and atomic managed-directory publication are transport-agnostic and already cover executable payloads — Tool packages ship code through the same machinery today.

## Goals / Non-Goals

**Goals:**

- One descriptor schema accepting `stdio` and `streamable-http` server entries, mixed within a package.
- Local-execution safety rules enforced at validation and mount time, not at runtime trust.
- Credential-reference semantics identical in shape for header slots (HTTP) and env slots (stdio).

**Non-Goals:**

- Python or other interpreter runtimes beyond the configured allowlist (the allowlist mechanism makes adding them a config change plus validation tests, not a schema change).
- OAuth enrollment, public discovery, remote marketplaces.
- Market-driven stdio spawn options per server (timeout, reconnect) — mount options stay Host-chosen and identical to the HTTP branch (`toolCallTimeoutMs` 60s, `failOnStartupError: false` → diagnostic).
- Direct `mcp-client` cordis.yml configuration — already supports stdio and is untouched.

## Decisions

**1. Discriminated transport union in the shared descriptor schema.**
`servers[]` becomes a zod union discriminated on `transport`: the existing `streamable-http` object unchanged, plus a `stdio` object with `id`, `command`, `args: string[]`, `env: Record<string,string>` (fixed values, default `{}`), `credentialReferences: Record<envName, REF>` (default `{}`). Mixed packages fall out of the array for free. Alternative — a separate `kind: 'mcp-stdio'` package type — duplicates the signature/trust/lifecycle machinery for no behavioral difference; rejected.

**2. Interpreter allowlist is a validated `Config` field on `mcp-market`, checked at the market layer.**
`stdioInterpreters` (array of bare command names, default `['node']`) per the no-hardcoded-tunables convention; extendable from cordis.yml for deployments that trust e.g. a bundled python. The core schema validates `command` as a bare name (no path separators — `^[A-Za-z0-9._-]+$`); membership in the allowlist is checked by the `mcp-market` service at install and re-checked at activation, because only the Host knows its own policy. Alternative — free-string `command` (PATH or absolute) — turns every installed package into arbitrary binary execution; rejected: the executable surface stays "run signed package code under a Host-approved interpreter".

**3. Script arguments must resolve inside the signed file table; `cwd` is composed by the Host.**
At parse time every `args` entry matching the relative-path grammar must name a file in the descriptor's signed `files` table (the same table that already pins every payload byte by SHA-256). The descriptor never carries absolute paths; `activateConfigured()` composes `cwd` as the package's managed directory at mount time. This keeps signatures location-independent and blocks `../` escapes structurally (the relative-path regex already rejects them; the file-table cross-check adds "must be declared content").

**4. Credential model generalizes headers→slots.**
The existing parse-time rule ("a header backed by a credential reference must have an empty fixed value") becomes slot-generic: for stdio, the slot domain is env-var names. Resolution stays in `activateConfigured()` only; resolved values exist only inside the mount call's `env` object, which `dsh-mcp-client` already builds over `scrubbedParentEnv()`. No new secret-bearing surface is introduced: persisted configuration, list output, template catalog, and diagnostics continue to carry reference names only.

**5. Permission disclosure is declared-and-validated, with stdio implying `subprocess`.**
The MCP descriptor gains an optional `permissions` array using the Tool package enum. Validation injects/implies `subprocess` for any stdio server regardless of declaration, so the disclosure the UI renders is a schema fact, not a UI guess. `mcp-marketplace` list results carry the permission summary; the install confirmation in `ui-skill-market` renders it before install commits.

**6. Activation mirrors Tool-market revalidation.**
`activateConfigured()` re-reads the descriptor and re-verifies payload hashes from the managed directory before mounting (parity with `tool-market`'s `activateInstalled`), then branches per server: HTTP resolves header credentials as today; stdio resolves env credentials, composes `cwd`, and mounts. Per-package failure records a diagnostic and rolls back that package's already-mounted servers; other packages mount independently.

## Risks / Trade-offs

- [Market now distributes executable local code] → Mitigation: publisher signature + signed file table (already required), interpreter allowlist, file-table-pinned args, pre-install permission disclosure; same trust line Tool packages already cross, with subprocess isolation the in-process Tool path does not have.
- [Interpreter absent from PATH on the host] → explicit per-package diagnostic naming the missing command; never a silent skip (fail-loud convention).
- [Fixed env values smuggling secrets past the reference rule] → reuse the existing secret-like-value rejection (currently applied to header values) over stdio fixed env values at parse time.
- [Windows PATH/`.cmd` resolution variance for `node`] → allowlist stores bare names and the SDK spawn resolves PATH; script args stay archive-relative POSIX paths, which the file-table pin already normalizes. Residual variance is a diagnostics concern, not a security one.
- [Descriptor format stays `1` while growing fields] → old descriptors (HTTP-only) remain valid under the widened union; a stale Host rejects unknown stdio fields loudly through the strict schema. Pre-release stance: no migration shim.

## Migration Plan

Purely additive to on-disk state: existing installed HTTP-only packages and their saved configurations validate unchanged; the configuration document format does not change (it already stores only reference names per slot). Rollback is uninstalling stdio packages; an older Host composition simply fails validation of stdio descriptors with a structured error.

## Open Questions

- Whether the bundled Python runtime should join the default interpreter allowlist, or arrive later as a documented cordis.yml extension — deferrable; the allowlist mechanism supports either without schema change.
