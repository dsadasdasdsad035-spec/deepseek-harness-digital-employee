# `@deepseek-ai/dsh-marketplace-core`

English | [中文](README.zh.md)

Shared security and filesystem primitives for managed Skill, Tool, and MCP marketplaces.

The package validates bounded base64 ZIP input, rejects unsafe or duplicate normalized paths and unsupported entries, parses versioned package descriptors, verifies SHA-256 file tables and Ed25519 signatures, serializes managed manifests, and performs keyed atomic install, replacement, rollback, and uninstall operations.

Managed mutations act only on directories carrying a compatible `.dsh-market.json` record for the requested kind and identity. Failures expose stable codes and archive-relative names, never absolute Host paths.

## Publisher CLI

The `dsh-market-package` bin turns a source directory into an installable Tool or MCP package. It computes the descriptor `files` SHA-256 table from the actual bytes, replaces publisher placeholders with the supplied identity, signs the canonical descriptor payload with Ed25519, and self-validates the assembled archive through the installer-shared checks.

```sh
dsh-market-package ./my-package --kind tool --publisher-id my-publisher \
  --generate-key ./publisher.pem --output my-package.zip
```

The command prints the matching `DSH_MARKET_TRUSTED_PUBLISHERS` JSON array on stdout; private key bytes stay in the key file and never appear in the archive or stdout. Pass `--trust-file <path>` to persist the record into the conventional trusted-publisher file (`market-publishers.json` under the Harness home, created owner-only and merged by publisher id), or export the printed array in the launching shell. Marketplace gateways that configure a `trustedPublishersFile` combine file and inline records and fail composition on malformed files, unsafe permissions, or a duplicated publisher id across sources.

## Model Experience

None, as archive validation and managed filesystem mutations do not change prompt projections, model requests, or session logs.

#### KV Cache effect

These primitives do not add or modify request history.

## Known Limitations and Deferred Work

- **Provider integration is separate** — each marketplace provider owns publisher trust storage and package-specific activation.
