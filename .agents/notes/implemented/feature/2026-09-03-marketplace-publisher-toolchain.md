# Agent Note: Marketplace publisher toolchain

Status: implemented

English | [中文](2026-09-03-marketplace-publisher-toolchain.zh.md)

## Problem

Tool and MCP marketplace packages require a signed descriptor from an explicitly trusted publisher, but the only signing implementation lived in test fixtures. The downloadable publisher templates carried placeholder identity and signature values, so no publisher could turn the distributed template into an installable archive without hand-writing serialization-sensitive Node code.

## Decision

`@deepseek-ai/dsh-marketplace-core` owns the producer side beside its validators. `signMarketplacePackage()` signs an in-memory descriptor and exact file inventory; `buildMarketplacePackage()` reads a source directory, requires the descriptor's `files` keys to match the directory exactly, and delegates to the same signing path. Both re-run the installer-shared archive, descriptor, file-table, and signature checks over their own output before returning bytes, so builder acceptance and installer acceptance cannot drift apart.

The `dsh-market-package` bin wraps the builder. It takes a source directory, kind, real publisher id, and either an existing Ed25519 private key or a request to generate one (`0600`). stdout carries exactly the `DSH_MARKET_TRUSTED_PUBLISHERS` JSON array derived from the signing key; private key bytes never enter the archive, trust record, or stdout.

`--trust-file <path>` persists the emitted record into the conventional Harness-home `market-publishers.json`: the file is created owner-only, records merge by publisher id, and reusing an id with a different public key is refused. Marketplace gateways with a `trustedPublishersFile` config combine file and inline records at composition; malformed files, unsafe permissions, or a duplicated publisher id across sources fail loudly. The `DSH_` environment prefix stays bootstrap-only, so the file — not `.env` — is the persistent trust source.

Source descriptor signature values are always replaced and never trusted; placeholder publisher identities are rejected only when still equal to the shipped template placeholder. The Tool and MCP template downloads are labeled "publisher template" in every locale, while the unsigned-but-installable skill template keeps the "example ZIP" label.

## Alternatives considered

- **Ship pre-signed template archives and auto-trust a bundled dev publisher**: this turns "trusted publisher" into a constant and risks the dev trust path leaking into non-dev composition; printing the exact trust value keeps the round trip one explicit export away.
- **Keep signing in test fixtures or publisher hand-rolled scripts**: canonical JSON serialization, file-table hashing, and archive rules then drift silently from installer validation.
- **Trust the descriptor's own signature value when present**: any placeholder or stale signature would then need its own validation rules, while the toolchain's job is precisely to replace it.

## Consequences

A publisher can complete download template → generate key → sign → export the printed trust record → upload without repository-specific code, and the marketplace gateway fixtures sign through the same API as production. Deployments still decide trust explicitly: no publisher is trusted by default, an unmodified template still fails with `untrusted-publisher`, and the signing step remains a local operation without any registry or remote publishing service.
