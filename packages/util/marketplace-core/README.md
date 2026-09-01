# `@deepseek-ai/dsh-marketplace-core`

English | [中文](README.zh.md)

Shared security and filesystem primitives for managed Skill, Tool, and MCP marketplaces.

The package validates bounded base64 ZIP input, rejects unsafe or duplicate normalized paths and unsupported entries, parses versioned package descriptors, verifies SHA-256 file tables and Ed25519 signatures, serializes managed manifests, and performs keyed atomic install, replacement, rollback, and uninstall operations.

Managed mutations act only on directories carrying a compatible `.dsh-market.json` record for the requested kind and identity. Failures expose stable codes and archive-relative names, never absolute Host paths.

## Model Experience

None, as archive validation and managed filesystem mutations do not change prompt projections, model requests, or session logs.

#### KV Cache effect

These primitives do not add or modify request history.

## Known Limitations and Deferred Work

- **Provider integration is separate** — each marketplace provider owns publisher trust storage and package-specific activation.
