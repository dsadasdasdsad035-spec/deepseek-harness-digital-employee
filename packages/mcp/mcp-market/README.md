# `@deepseek-ai/dsh-mcp-market`

English | [中文](README.zh.md)

Managed installation and credential-reference configuration for declarative Streamable HTTP MCP packages.

## Configuration

`installRoot` is the private user directory for managed packages. `trustedPublishers` contains Ed25519 publisher public keys. The Web bundle reads these records from `DSH_MARKET_TRUSTED_PUBLISHERS`.

## Package lifecycle

`mcp-package.json` declares package identity, version, display text, Streamable HTTP servers, fixed headers, credential-reference slots, a SHA-256 table for every non-descriptor file, and a detached publisher signature. The shared archive validator and atomic managed-directory operations apply the same path, size, trust, and ownership rules as Tool packages.

Configuration persists only credential reference names. Resolved values exist only while the Host mounts a configured server through `McpClientManager`; list, template catalog, diagnostics, and publication data omit them. A credential-backed header must have an empty fixed value, and requests containing secret-like values are rejected.

`marketplace-test-mcp.zip` declares endpoint reference `MARKETPLACE_TEST_MCP_ENDPOINT` and credential reference `MARKETPLACE_TEST_MCP_TOKEN` without embedding either resolved value. Offline tests bind the endpoint to an ephemeral loopback server. Template projection omits fixed header entries owned by credential references and persists only `headerCredentials`.

Install, upgrade, configuration, and uninstall are restart-bound. A fresh Host resolves references, enforces unique server names, and mounts available clients. Missing packages, credentials, or conflicting server names remain explicit diagnostics.

## Model Experience

None, as package lifecycle and credential-reference configuration do not change prompt projections, model requests, or session logs.

#### KV Cache effect

Marketplace operations do not add or modify request history; the MCP client owns any tool schemas and results after a later Host composition mounts a configured server.

## Known Limitations and Deferred Work

- **Transport support is limited** — managed packages support Streamable HTTP only.
- **Enrollment remains external** — public discovery, OAuth enrollment, local command transports, and publisher identity services are not provided.
