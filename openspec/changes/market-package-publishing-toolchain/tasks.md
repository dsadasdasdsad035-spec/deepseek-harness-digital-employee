## 1. Core build API

- [x] 1.1 Add safe source-directory reading to `packages/util/marketplace-core`: reject absolute paths, path traversal, symbolic links, and non-regular files; require the non-descriptor inventory to match descriptor `files` keys exactly.
- [x] 1.2 Implement descriptor completion and signing: recompute SHA-256 hash values into `files`, reject a still-placeholder publisher identity, sign via `descriptorSignaturePayload()`, and support both Tool and MCP descriptor kinds.
- [x] 1.3 Implement deterministic ZIP assembly with fixed entry mtimes, then self-validate the assembled archive through the installer-shared `preparePackageArchive()`, descriptor parsing, and signature verification before returning bytes.
- [x] 1.4 Export the build API from `@deepseek-ai/dsh-marketplace-core` with JSDoc contracts, and cover it with unit tests including the build→install-validation round trip and every rejection path.

## 2. Publisher CLI

- [x] 2.1 Add the `dsh-market-package` bin to `packages/util/marketplace-core` using `node:util` `parseArgs`: source directory, `--kind`, `--publisher-id`, `--private-key`/`--generate-key`, and output path options.
- [x] 2.2 Implement key handling: read or create an Ed25519 PEM key (`0600` for generated files), never emit private-key bytes, and print the `{ id, publicKeyPem }` trust record in the JSON shape `DSH_MARKET_TRUSTED_PUBLISHERS` consumes.
- [x] 2.3 Cover the CLI with subprocess tests: build each template kind, key generation permissions, placeholder rejection, and failure exit codes without partial output.

## 3. Templates and marketplace UI

- [x] 3.1 Update Tool and MCP template READMEs (all locales) to document the CLI signing workflow and trust-record configuration instead of hand-written signing steps.
- [x] 3.2 Split the download label: skill sections keep "example ZIP", Tool and MCP sections use a new "publisher template" key in every supported locale in `packages/client/ui-skill-market/src/client/locales.ts`.
- [x] 3.3 Regenerate the checked-in `tool-market-template.zip` and `mcp-market-template.zip` via the existing template generator and verify the regenerated archives still pass template inspection.

## 4. Integration and verification

- [x] 4.1 Replace hand-rolled signing in `packages/tool/tool-market` and `packages/mcp/mcp-market` gateway test fixtures with the shared build API, keeping one fixture that verifies a raw Ed25519 signature end to end.
- [x] 4.2 Add an integration test that downloads the checked-in Tool and MCP templates, builds them with a generated key, configures the emitted trust record, and installs them through both marketplaces.
- [x] 4.3 Update marketplace UI coverage for the relabeled download actions (component semantics plus the web e2e assertions; no stored snapshot contains the label) and run the focused package tests plus template generation.
- [x] 4.4 Write the required Agent Note covering the publisher-toolchain decision and the explicit-trust boundary, and update affected README documentation.
