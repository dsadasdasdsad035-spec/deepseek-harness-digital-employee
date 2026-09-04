# `@deepseek-ai/dsh-mcp-market`

English | [中文](README.zh.md)

Managed installation and credential-reference configuration for Streamable HTTP and stdio MCP packages.

## Configuration

`installRoot` is the private user directory for managed packages. `trustedPublishers` contains Ed25519 publisher public keys. The Web bundle reads these records from `DSH_MARKET_TRUSTED_PUBLISHERS`.

`stdioInterpreters` (default `['node']`) lists the bare interpreter command names a stdio server may name; install and activation reject any other command with a structured failure naming it.

`allowUnsignedPackages` (default `false`) is an explicit development override: when enabled, install and activation skip publisher-trust verification while every archive, descriptor, file-table, ownership, credential-reference, and atomicity rule still applies. The Web bundle enables it unless the launch environment sets `DSH_MARKET_ALLOW_UNSIGNED=0`; setting that value restores strict verification on the next composition.

## Package lifecycle

`mcp-package.json` declares package identity, version, display text, servers of either transport (mixed in one package), fixed header or environment values, credential-reference slots, a SHA-256 table for every non-descriptor file, an optional permission disclosure, and a detached publisher signature. The shared archive validator and atomic managed-directory operations apply the same path, size, trust, and ownership rules as Tool packages.

A stdio server ships its executable payload inside the signed file table: `command` must be a bare name on the interpreter allowlist, every slash-containing `args` entry must be a declared file, and the Host runs the server from the managed package directory over a scrubbed parent environment. Any stdio server implies the `subprocess` permission, and the marketplace requires one explicit local-execution confirmation (`confirmLocalExecution`) before installing or upgrading such a package.

Configuration persists only credential reference names, for HTTP header slots and stdio environment-variable slots alike. Resolved values exist only while the Host mounts a configured server through `McpClientManager`; list, template catalog, diagnostics, and publication data omit them. A credential-backed header or environment variable must have an empty fixed value, and requests containing secret-like values are rejected.

Install, upgrade, configuration, and uninstall are restart-bound. A fresh Host resolves references, enforces unique server names, and mounts available clients. Missing packages, credentials, interpreters, or conflicting server names remain explicit diagnostics.

## Model Experience

None, as package lifecycle and credential-reference configuration do not change prompt projections, model requests, or session logs.

#### KV Cache effect

Marketplace operations do not add or modify request history; the MCP client owns any tool schemas and results after a later Host composition mounts a configured server.

## Known Limitations and Deferred Work

- **Enrollment remains external** — public discovery, OAuth enrollment, and publisher identity services are not provided.
- **Interpreter allowlist ships with `node` only** — deployments extend the list through `stdioInterpreters`; other runtimes (for example the bundled Python) are a documented configuration change, not new schema.
