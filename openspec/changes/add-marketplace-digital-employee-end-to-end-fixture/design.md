## Context

The three marketplaces already share managed ZIP lifecycle concepts, while their runtime activation differs: Skills are preset-scoped, executable Tool plugins require publisher verification and Host restart, and MCP packages declare Streamable HTTP clients whose credential references must be resolved without exposing values. Template configuration already combines marketplace metadata with runtime registries, but current examples and browser tests do not assemble all three asset kinds into one employee-owned conversation. See `proposal.md` and the capability deltas for the required behavior.

## Goals / Non-Goals

**Goals:**

- Provide deterministic, directly installable examples for each marketplace without weakening production trust or credential handling.
- Exercise the real managed directories, restart activation, template catalog, publication, employee creation, task-start, capability composition, and durable attribution paths.
- Keep the complete reference workflow keyless, offline, and reproducible on supported development platforms.
- Divide verification across focused package tests, an assembled keyless snapshot, and Web E2E according to the behavior each harness can observe.

**Non-Goals:**

- Trust a bundled Tool publisher in production by default.
- Add another marketplace package format, MCP transport, or credential-value storage path.
- Treat downloadable author scaffolds and installable test fixtures as the same artifact.
- Use the fixture packages as compatibility promises for third-party package authors.
- Depend on a real model, external MCP service, or internet access.

## Decisions

### Keep author templates separate from installable test examples

The existing Tool and MCP downloads remain author-facing scaffolds with placeholders. New example archives use fixed test identities and complete manifests so automated workflows can install them unchanged. The Skill example can serve both roles only while it continues to satisfy the same installation validation.

This avoids teaching authors to reuse fixture identities or test credentials. Replacing placeholders in the author templates at download time was rejected because a generated signature would either require shipping private signing material or produce an archive that cannot be verified later.

### Use a deterministic test-only Tool publisher

The repository owns a fixed Ed25519 test keypair used only to create or verify fixture artifacts in development and tests. The public key enters the trusted publisher set only through explicit test configuration; production defaults remain empty or deployment-controlled. The private key is fixture material, is never loaded by the running marketplace, and is documented as unsuitable for distributed packages.

An unsigned executable example was rejected because it would bypass the marketplace's central security property. Automatically trusting the bundled public key was rejected because distribution with the product is not sufficient publisher authorization.

### Make the Tool behavior narrow and deterministic

The example registers `marketplace_test_echo` with input `{ text: string }` and returns a stable response derived from `text`. It requests only the minimum permission category required by the existing manifest format and declares no credentials.

A richer example was rejected because additional permissions and side effects would obscure whether registration, authorization, and invocation work.

### Use a local Streamable HTTP MCP fixture

The example MCP package declares server `marketplace-test-mcp`, endpoint reference `MARKETPLACE_TEST_MCP_ENDPOINT`, credential reference `MARKETPLACE_TEST_MCP_TOKEN`, and the supported Streamable HTTP transport. MCP descriptors accept either a fixed URL or an endpoint reference. Host-owned MCP marketplace configuration resolves endpoint references to validated HTTP(S) URLs before activation; endpoint values are non-secret and remain separate from credential storage. Test scaffolding starts a loopback server on an ephemeral port, binds the endpoint reference to its assigned URL, and resolves the credential reference to a non-secret fixture token. The server checks the expected authorization metadata and returns a deterministic lookup result.

Adding a subprocess transport was rejected because it would expand the supported product surface. Omitting credentials was rejected because the workflow must prove reference-only configuration. An external endpoint was rejected because it would make the reference workflow network-dependent.

### Relaunch the Host while preserving marketplace state

The Web E2E scaffold owns a temporary `harnessHome`, starts the Host, installs and configures the packages, stops it cleanly, and starts a new Host process against the same home and loopback MCP fixture. Assertions before restart cover pending activation; assertions after restart cover runtime registration and catalog correlation.

Mocking the restart flag or mutating registries in process was rejected because it would not prove package discovery during real Host boot. Reusing a single Host process was rejected because Tool and MCP activation is intentionally restart-bound.

### Drive chat with a deterministic model script

The assembled task uses a deterministic model provider sequence that first inspects the authorized Skill, then invokes `marketplace_test_echo`, then invokes `mcp__marketplace-test-mcp__lookup`, and finally reports stable markers from all three results. The script also attempts to observe a known installed-but-undeclared fixture capability, which must be absent.

Prompt-only assertions were rejected because they do not prove Tool execution. UI-only text assertions were rejected as the sole evidence because durable Session events and invocation records are the authoritative source for model-visible capability use and attribution.

### Split coverage by ownership

Focused package tests validate fixture archive generation, signatures, descriptors, trust rejection, credential-reference handling, and deterministic Tool/MCP responses. A keyless assembled snapshot validates the employee composition and model-visible transcript through a runnable example. Web E2E validates user actions from marketplace upload through restart, template publication, employee creation, `@` selection, and conversation completion. The browser test also inspects durable or RPC-projected evidence for the three operations where available.

One large browser-only test was rejected because archive and trust failure diagnostics are cheaper and clearer at package level. Mock-only unit coverage was rejected because it cannot prove the assembled Host and Web path.

## Risks / Trade-offs

- [Fixture signing material may be mistaken for production credentials] -> Name and document it as test-only, keep trust opt-in, and add a rejection test using production defaults.
- [Restarting the Host can make Web E2E slower or flaky] -> Reuse one temporary home, wait on explicit readiness, stop processes cleanly, and avoid fixed sleeps.
- [Loopback MCP ports can collide] -> Bind an ephemeral port and generate the package/configuration endpoint from the assigned address.
- [Deterministic model sequencing can overfit presentation text] -> Assert capability identities, structured calls, durable events, and stable fixture markers rather than incidental prose.
- [A single workflow can become difficult to diagnose] -> Preserve focused package tests and split E2E phases with explicit install, activation, configuration, and runtime assertions.
- [Fixture identities can collide with a developer's real state] -> Run assembled tests in isolated temporary homes and reserve clearly test-scoped package identities.

## Migration Plan

No persisted production format changes are required. Add fixture assets and test-only configuration first, then add package-level verification, assembled snapshot support, and the Web workflow. Rollback removes the fixtures and tests; existing marketplace installations, templates, and employee data remain valid because production trust defaults and package formats are unchanged.
