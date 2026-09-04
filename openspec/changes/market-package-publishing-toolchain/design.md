## Context

Tool and MCP package installation already validates a bounded ZIP, a strict descriptor schema, a SHA-256 file table, and a detached Ed25519 signature against a host-configured trusted-publisher list (`packages/tool/tool-market`, `packages/mcp/mcp-market`, shared logic in `packages/util/marketplace-core`). The producer side does not exist outside test fixtures: the shipped templates carry placeholder publisher fields, the Web Host trusts no publisher by default, and `generatePackageTemplate()` in `packages/client/ui-skill-market/templates/archive.ts` deliberately emits unsigned archives.

## Goals / Non-Goals

**Goals:**

- One supported command turns a source directory into an archive that both marketplaces accept, with no signing code outside `marketplace-core`.
- A developer can complete download template → generate key → sign → configure trust → upload without writing ad-hoc Node scripts.
- Keep explicit trust: no publisher becomes trusted by any default configuration.

**Non-Goals:**

- No remote marketplace, key registry, or publishing service; trust records stay local Host configuration.
- No change to installer validation, restart semantics, or package on-disk format.
- No pre-signed public example package: unsigned templates remain the distributed artifact, and signing remains a local step.

## Decisions

### Build operations live in `marketplace-core`; the CLI is a thin bin

`marketplace-core` gains the package-building counterpart to its validators: read a source directory, validate safe relative paths and file inventory, recompute the descriptor file table, sign the canonical payload through the existing exported `descriptorSignaturePayload()`, and assemble a deterministic ZIP (fixed entry mtimes, matching the current template generator). Before writing, the builder re-validates its own output with the same `preparePackageArchive()`, descriptor parse, and signature verification the installers use, so builder acceptance and installer acceptance cannot drift.

The executable is a `dsh-market-package` bin on `@deepseek-ai/dsh-marketplace-core`, parsing argv with `node:util` `parseArgs` (no new dependency). Alternatives: logic inside the CLI script (untestable and duplicative) or a separate CLI package (over-built for one command while the operation has no independent evolution from the core rules).

### Descriptor `files` keys are the author's inventory; hash values are recomputed

The author declares which non-descriptor files ship; the builder hashes exactly those files and rewrites the hash values before signing. A directory that omits a declared file or contains an undeclared extra file fails. This prevents smuggling content past the signed table while keeping hand-computed hashes out of the authoring workflow. Placeholder hash values in templates are therefore acceptable input. The toolchain's `--publisher-id` replaces the descriptor's publisher identity, so a placeholder identity fails only when the supplied identity is itself still a placeholder; source signature values are always replaced by the builder's own signature and never trusted as input.

### Key handling is local-files-only with separated outputs

`--private-key <path>` reads an Ed25519 PEM private key. `--generate-key <path>` creates one with `0600` permissions. In both cases the command prints only the matching `{ id, publicKeyPem }` trust record in the JSON shape `DSH_MARKET_TRUSTED_PUBLISHERS` consumes. Private key bytes never enter the archive, the trust record, logs, or stdout. A generated key is never implicitly registered anywhere; the operator exports the printed record explicitly.

Rejected alternative: bundling a development publisher key auto-trusted by the Web Host in dev mode. It would make the round trip zero-configuration but turns "trusted publisher" into a constant and risks the dev trust path leaking into non-dev composition; printing the exact env value keeps the round trip short without a default trust decision.

### UI wording splits by trust model

The skill marketplace keeps the existing "example ZIP" download label. The Tool and MCP sections switch to a new "publisher template" locale key in every supported locale, because their archives require signing before installation. Template READMEs replace the hand-signing instructions with the CLI invocation and trust-record configuration.

## Risks / Trade-offs

- [Private key misuse through loose file permissions] → generated keys are `0600`; the CLI refuses world/group-readable key files it creates and never echoes key bytes.
- [Publisher id mismatch between signature and trust record] → the printed trust record is derived from the same `--publisher-id` used for signing, and installers already report `untrusted-publisher` with the exact id on mismatch.
- [Builder and installer rules diverge over time] → the builder validates its output through the installer-shared core functions, and the Tool/MCP gateway test fixtures switch from hand-rolled signing to the builder so drift breaks tests.
- [Users still expect the downloaded template to install directly] → the relabeled download action and README state the signing prerequisite; the failure remains the existing structured `untrusted-publisher` error.

## Migration Plan

Pre-release: add the bin and build API, regenerate the checked-in template archives, and update locale strings in one change. Rollback is removing the bin and reverting the template/locale regeneration; no on-disk package format changes.
