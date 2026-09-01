# `@deepseek-ai/dsh-tool-market`

English | [中文](README.zh.md)

Trusted, restart-bound installation for versioned Tool ZIP packages.

## Configuration

`installRoot` is the private user directory for managed packages. `trustedPublishers` maps each publisher ID to one Ed25519 SPKI public key; duplicate IDs fail during resolution. The Web bundle reads the same records from `DSH_MARKET_TRUSTED_PUBLISHERS`.

## Package lifecycle

`tool-package.json` declares package identity, version, display text, requested permission categories, Tool names and input descriptions, the plugin entry, a SHA-256 table for every non-descriptor file, and a detached publisher signature. Install validates the bounded ZIP, normalized paths, file table, descriptor, and trusted signature before atomically publishing files. It never imports uploaded code.

Install of an existing managed identity requires explicit replacement. Install, upgrade, and uninstall report `restartRequired: true`; a fresh Host composition revalidates the installed descriptor, signature, and files before importing the entry plugin. Directories without a compatible marketplace manifest are never replaced or removed.

`marketplace-test-tool.zip` is a directly installable reference package that registers `marketplace_test_echo`. Its fixed Ed25519 keypair is test fixture material: the running marketplace receives only the public key through explicit development or test configuration, and production defaults do not trust it.

## Model Experience

None, as package installation and inventory do not change prompt projections, model requests, or session logs.

#### KV Cache effect

Marketplace operations do not add or modify request history; an installed plugin owns any effects after a later Host composition activates it.

## Known Limitations and Deferred Work

- **Publisher trust is local** — the marketplace does not provide public discovery, publisher identity, or payment.
- **Activation is restart-bound** — uploaded code is not hot-loaded, and activated plugins remain responsible for their own runtime isolation.
