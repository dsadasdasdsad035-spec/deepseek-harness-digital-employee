## 1. Marketplace foundations

- [x] 1.1 Extract the existing Skill Market's managed archive, manifest, atomic mutation, and structured-failure primitives into a shared marketplace foundation with focused security tests.
- [x] 1.2 Define versioned Tool and MCP package descriptors, managed manifests, resource limits, publisher signatures, and local trusted-publisher configuration.
- [x] 1.3 Add typed remote definitions, generated client projections, and Host result types for marketplace inventory, archive install, explicit upgrade, uninstall, and MCP credential-reference configuration.
- [x] 1.4 Add documentation and ZIP templates for Tool and MCP publishers, including signing, permission declarations, and credential-reference-only rules.

## 2. Tool marketplace

- [x] 2.1 Implement the Tool marketplace Host provider with bounded archive validation, publisher verification, ownership checks, atomic install/rollback, explicit replacement, and uninstall.
- [x] 2.2 Implement restart-bound discovery and activation for trusted Tool package bundles without evaluating uploaded code in the running Host.
- [x] 2.3 Surface registered tool metadata, parameter descriptions, permission declarations, availability, and restart-pending state through the marketplace inventory.
- [x] 2.4 Add Host, archive-security, lifecycle, and built-runtime tests for Tool package install, upgrade, uninstall, untrusted publisher, and restart behavior.

## 3. MCP marketplace

- [x] 3.1 Implement the MCP marketplace Host provider with the shared archive protections, managed lifecycle, and declarative MCP package validation.
- [x] 3.2 Implement per-user MCP client configuration that persists credential references but rejects and redacts resolved credential values.
- [x] 3.3 Integrate managed MCP package activation with the existing MCP client manager, uniqueness checks, and restart-pending availability state.
- [x] 3.4 Add Host and integration tests for MCP install, configuration, credential redaction, ownership conflicts, and unavailable-package diagnostics.

## 4. Marketplace Web experience

- [x] 4.1 Extend the Marketplace settings area with Skill, Tool, and MCP tabs that share search, metadata cards, upload, progress, upgrade confirmation, uninstall confirmation, and accessible status handling.
- [x] 4.2 Add Tool permission-review UI and MCP credential-reference setup UI without rendering secret values.
- [x] 4.3 Add client tests for loading, empty, search, install, upgrade, uninstall, restart-required, validation-failure, and credential-redaction states.
- [x] 4.4 Add a keyless snapshot covering the assembled Web marketplace flow.

## 5. Digital employee template selectors

- [x] 5.1 Add an administrator-only marketplace template catalog remote that resolves installed Skills, available registered Tools, and configured MCP clients with availability and permission summaries.
- [x] 5.2 Add capability selector state and searchable multi-select controls to the digital employee configuration studio for Skills, Tools, and MCP clients.
- [x] 5.3 Preserve existing raw references as unresolved diagnostics, retain advanced expert/memory/delegation editors, and prevent authority escalation.
- [x] 5.4 Add Host, store, component, and configuration-studio tests for selector persistence, unavailable assets, authority validation, and published-template behavior.

## 6. Composition, documentation, and verification

- [x] 6.1 Compose the new marketplace Host and Web plugins in the Web bundle with configurable user directories and trusted-publisher settings.
- [x] 6.2 Update package READMEs, user documentation, configuration catalogs, and an Agent Note describing trust, restart, credential, and published-template lifecycle decisions.
- [x] 6.3 Run focused unit and integration tests, the required keyless snapshot, `pnpm run typecheck`, `pnpm run build`, and `pnpm run doc-sync`.
