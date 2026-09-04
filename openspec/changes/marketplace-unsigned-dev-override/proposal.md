## Why

Developers testing their own Tool and MCP marketplaces must otherwise sign every candidate package and configure publisher trust before any upload succeeds, which makes local iteration slower than the product warrants while the default trust boundary stays correct.

## What Changes

- Add an `allowUnsignedPackages` marketplace configuration (default `false`) to the Tool and MCP gateways; when explicitly enabled, install and restart-time activation skip publisher-trust and signature verification while every archive, descriptor, file-table, ownership, and atomicity rule still applies.
- Wire the Web bundle switch so unsigned packages are enabled by default and `DSH_MARKET_ALLOW_UNSIGNED=0` restores strict verification.
- Record the decision in the marketplace Agent Note: the override is an explicit local launch choice, not a weakened default.

## Capabilities

### New Capabilities

<!-- None: this modifies existing marketplace behavior. -->

### Modified Capabilities

- `tool-marketplace`: publisher-trust verification becomes conditional on the explicit unsigned override; archive safety is unchanged.
- `mcp-marketplace`: the same conditional override for MCP package trust verification.

## Impact

- `packages/tool/tool-market` and `packages/mcp/mcp-market`: gateway config, service option, and the two trust-verification call sites per service.
- `packages/bundle/web-app/cordis.patch.yml`: launch-environment wiring for both gateways.
- Marketplace Agent Note and the two package READMEs.
