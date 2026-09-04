## Why

Marketplace publisher trust currently reaches Tool and MCP marketplaces only through `DSH_MARKET_TRUSTED_PUBLISHERS`, and the `DSH_` prefix is bootstrap-only: a checkout or Harness-home `.env` may not set it, so every Host restart needs the full JSON re-exported in the launching shell. When trust fails, the typed `untrusted-publisher` outcome carries the descriptor's publisher id, but the marketplace UI reduces it to a generic sentence, leaving users to inspect raw RPC responses to learn which identity was rejected.

## What Changes

- Add a persistent trusted-publisher file at the Harness-home path `market-publishers.json`, holding the same `[{ id, publicKeyPem }]` records the publisher CLI prints, so one export persists across Host restarts.
- Read the file during Tool and MCP marketplace composition; a malformed file, invalid record, or unsafe permission fails loudly instead of silently trusting nothing.
- Keep launch-environment trust working: `DSH_MARKET_TRUSTED_PUBLISHERS` still supplies records, and duplicated publisher ids between the two sources fail loud instead of silently winning.
- Render the publisher id in the marketplace UI's untrusted-publisher and invalid-signature failures in every supported locale.
- Update the publisher CLI output contract documentation and Tool/MCP template READMEs to name the persistent file alongside the export form.

## Capabilities

### New Capabilities

- `marketplace-publisher-trust`: Persistent, validated trusted-publisher configuration for Tool and MCP marketplaces, its precedence over launch-environment records, loud failure on invalid trust input, and actionable publisher-id diagnostics in the marketplace UI.

### Modified Capabilities

<!-- tool-marketplace and mcp-marketplace keep their existing install, trust-verification, and archive-safety requirements; only the source of trusted records changes. -->

## Impact

- `packages/util/marketplace-core`: shared trusted-publisher file reading and validation beside the existing trust helpers.
- `packages/tool/tool-market` and `packages/mcp/mcp-market`: composition reads the persistent file and merges it with configured records.
- `packages/bundle/web-app`: trust configuration wiring for both marketplaces.
- `packages/client/ui-skill-market`: localized failure text carrying the publisher id, and the typed failure path that preserves it.
- Publisher CLI documentation and Tool/MCP template READMEs in both locales.
