# Agent Note: MCP marketplace stdio transport

Status: implemented

English | [中文](2026-09-04-mcp-marketplace-stdio-transport.zh.md)

## Problem

The MCP marketplace accepted only declarative Streamable HTTP packages, so publishers of local MCP servers could not distribute them through the market and every market package depended on a remote URL. The Host already owned every mount primitive (`dsh-mcp-client` spawns stdio children over a scrubbed environment; the shared archive, file-table, and trust machinery is transport-agnostic), so the gap sat entirely in the descriptor schema, the credential model, and the activation path.

## Decision

`mcpPackageDescriptorSchema` widens `servers[]` to a discriminated union on `transport`; one package may mix Streamable HTTP and stdio servers. A stdio entry declares a bare `command`, `args`, fixed `env` values, and `credentialReferences` over environment-variable names, and ships its payload through the existing signed file table.

Local-execution safety is enforced at validation, install, and activation: `command` must be a bare name (no path separators) present on the Host-configured `stdioInterpreters` allowlist (default `['node']`, a validated `Config` field); every slash-containing `args` entry must be a declared file in the signed table, which pins script paths to signed content and structurally blocks `..` and absolute paths; the Host composes `cwd` as the managed package directory at mount time, so signatures stay location-independent.

Credential-reference semantics generalize from headers to slots: a credential-backed header or environment variable must carry an empty fixed value, configuration persists reference names only, and resolved values exist only inside the mount call's header or env object.

Any stdio server implies the `subprocess` permission in the parsed descriptor — the builder signs the normalized form, so the disclosure is a signed schema fact rather than a UI guess. The marketplace additionally requires one explicit `confirmLocalExecution` on install or upgrade of a stdio package: the first attempt bounces with `local-execution-confirmation-required` carrying the candidate permissions, the Web client renders the disclosure modal, and the retry carries the confirmation. Upgrade of a stdio package chains both confirmations without looping.

Activation mounts each server on the root context, not the gateway's service context: the service context sits outside the `tools` service resolution chain, so fibers mounted there register no tools. This was a latent defect in the existing Streamable HTTP path (tests mocked the mount call) and now applies to both transports.

The market's template declaration widens to the employee-template MCP declaration union (stdio entries carry `command`, `args`, `env`, `envCredentials`, `cwd`), which the digital-employee side already supported end to end.

## Alternatives considered

- **A separate `mcp-stdio` package kind**: duplicates the signature, trust, and lifecycle machinery for no behavioral difference; the transport union keeps both server types under one signed descriptor.
- **Free-string `command`**: turns every installed package into arbitrary binary execution; the bare-name grammar plus the interpreter allowlist keeps the executable surface at "run signed package code under a Host-approved interpreter".
- **Parse-time permission inference only, no confirmation gate**: the disclosure would be visible after install; the bounce-and-retry flow keeps the confirmation before any stdio package is published to the managed directory.
- **Secret-sniffing fixed env values**: the existing empty-fixed-value rule on credential-backed slots covers the actual leak path; both header and env slots share it.

## Consequences

Fully local, offline-capable MCP tooling is distributable through the market, and credential-bearing stdio servers never persist resolved values. Deployments wanting interpreters beyond `node` extend `stdioInterpreters` from cordis.yml. Install, upgrade, configuration, and uninstall remain restart-bound, and a stdio package whose interpreter drops off the allowlist surfaces as an explicit per-package diagnostic rather than mounting. The shipped publisher template is now mixed-transport, so every template install takes the local-execution confirmation path in tests. The bundled Python runtime joining the default allowlist remains open; the mechanism supports it without schema change.
