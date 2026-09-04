## Context

Both marketplaces already verify Ed25519 publisher signatures against a `trustedPublishers` list injected from Web-bundle configuration (`packages/bundle/web-app/cordis.patch.yml` reads `DSH_MARKET_TRUSTED_PUBLISHERS`, default `[]`). The launcher treats every `DSH_` name as bootstrap-only, so `.env` files cannot carry it and each restart needs a fresh shell export. The publisher CLI prints records but has no persistent destination, and the Web UI collapses the typed `untrusted-publisher` failure (which includes `publisherId`) into a generic locale sentence.

## Goals / Non-Goals

**Goals:**

- One Harness-home file persists trust records across restarts, validated as strictly as the existing inline list.
- The CLI can write its emitted record into that file, making sign → persist trust a single command.
- Publisher-verification failures are self-diagnosing in the UI.

**Non-Goals:**

- No key registry, remote trust distribution, or per-user trust management UI.
- No change to signature verification, install validation, or restart semantics.
- No relaxation of the bootstrap-only `DSH_` env policy; `.env` still cannot set launcher-trust variables.

## Decisions

### The owning gateways resolve trust at composition

`tool-market` and `mcp-market` each gain an optional `trustedPublishersFile` config path. Plugin composition reads that file, validates it, and combines its records with the inline `trustedPublishers` list before constructing the service. The Web bundle passes `dshHomePath('market-publishers.json')`. This keeps defaulting as an explicit step in the owning implementation, leaves `marketplace-core` gateways' request handling unchanged, and lets non-Web Hosts opt in by config alone.

Alternative: resolving inside `marketplace-core` with a fixed Harness-home path. Rejected — the util package does not own Host layout, and composition-time resolution belongs to the plugin that consumes the records.

### Validation is one rule set for both sources

A present file must be a regular, non-symlink, non-group/world-writable JSON array of `{ id, publicKeyPem }` records with unique ids; the same shape validation already applies to the inline list through the gateway config schema. Any violation — including a publisher id that appears in both sources — fails composition with the file path and offending record, never an empty-list fallback. Identical records across sources still fail: one id has one home, and silent merging would hide stale duplication from the operator.

### The CLI persists what it prints

`dsh-market-package` gains `--trust-file <path>`: when the file is absent it is created with `0600` containing the emitted single-record array; when present, the record is merged by id, refusing to overwrite an existing id with a different public key. stdout keeps printing the full record JSON exactly as before. The Tool and MCP template READMEs document `--trust-file` as the persistent form and the export form as the per-launch override.

### Failure text carries the rejected identity

The client package stores keep the typed failure object instead of reducing it to its code, and the shared failure-text helper interpolates the publisher id into the existing untrusted-publisher and invalid-signature locale entries in every locale. Other failure codes and the generic transport path are unchanged.

## Risks / Trade-offs

- [A writable trust file becomes a code-execution trust root] → group/world-writable files and symlinks are rejected at composition; the CLI creates the file owner-only.
- [Operators duplicate records across env and file] → composition fails with the duplicated id instead of guessing which key wins.
- [Stale trust after key rotation] → the CLI's merge refuses id reuse with a different key, forcing an explicit file edit; rotation remains a deliberate operator action.
- [Users expect `.env` to work] → the launcher's bootstrap-only rejection already names the variable and demands an export; the file is the documented persistent alternative.

## Migration Plan

Pre-release: additive config and file format, no migration. A Host without the file behaves exactly as today. Rollback removes the config wiring and CLI flag; the ignored file harms nothing.
