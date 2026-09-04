## Why

The Tool and MCP marketplaces ship downloadable "example ZIP" templates whose publisher identity and Ed25519 signature are placeholders, and the Web Host trusts no publisher by default. The templates therefore can never be installed as downloaded, while the only working signing code lives in test fixtures. Publishers have no supported path from source directory to installable package.

## What Changes

- Add a package publisher CLI that turns a source directory into an installable Tool or MCP marketplace ZIP: it computes the SHA-256 file table, signs the canonical descriptor payload with Ed25519, and writes the signed archive plus the matching `DSH_MARKET_TRUSTED_PUBLISHERS` record.
- Support generating a local Ed25519 publisher keypair so a developer can complete the download → sign → trust → upload round trip without external infrastructure. Production trust configuration remains explicit; no publisher is trusted implicitly.
- Route signing through the shared `descriptorSignaturePayload()` helper so the CLI, installers, and tests cannot drift on canonical serialization.
- Rename the Tool and MCP download action to "publisher template" (keeping the skill marketplace's "example ZIP" wording) so the unsigned template's purpose is stated accurately in both locales.
- Update the Tool and MCP template READMEs to document the CLI workflow instead of describing hand-written signing steps.

## Capabilities

### New Capabilities

- `marketplace-publisher-toolchain`: Produce trusted, installable Tool and MCP marketplace packages from source directories, including file-table hashing, canonical descriptor signing, trust-configuration output, and acceptance by the corresponding marketplace install path.

### Modified Capabilities

<!-- No existing requirement changes: install, trust, and archive-validation behavior is unchanged; this change adds the missing producer side. -->

## Impact

- `packages/util/marketplace-core`: export the shared package-building operations (file-table hashing, descriptor signing, archive assembly) beside the existing validators; keep `descriptorSignaturePayload()` as the single canonical payload source.
- New publisher CLI entry point (exact home settled in design): consumes a source directory, descriptor kind, publisher id, and private key or key-generation request.
- `packages/client/ui-skill-market`: Tool and MCP template wording in `locales.ts`, template README content, and regenerated checked-in template archives.
- Web Host configuration documentation: how a locally generated publisher record reaches `DSH_MARKET_TRUSTED_PUBLISHERS`.
