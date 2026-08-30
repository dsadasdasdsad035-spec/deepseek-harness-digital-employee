# `@deepseek-ai/dsh-skill-market`

English | [中文](README.zh.md)

Host-side reference for installing, upgrading, listing, serving promotional images for, and uninstalling marketplace-managed skills in the user skill directory.

The plugin exposes the generated `skillMarket` Typert Remote over the shared `/api` carrier. Browser code consumes its client-safe types through `@deepseek-ai/dsh-api-remotes`; this package retains archive validation, filesystem mutation, and management authority on the Host.

## Plugin

The plugin provides `ctx.skillMarket`. Its `list`, `install`, `banner`, and `uninstall` methods return declared business failures as discriminated outcomes. Transport cancellation, carrier failure, and unexpected implementation failure reject instead of masquerading as marketplace results.

### Config

| Field | Default | Meaning |
|---|---|---|
| `installRoot` | The DSH user skill directory | Absolute directory containing marketplace targets. The default is the same user directory discovered by the filesystem skill provider. |

## Bundle Layout

An uploaded ZIP contains either one skill at the archive root or one enclosing directory containing that skill. After the optional enclosing directory is removed, `SKILL.md` must be exactly at the bundle root.

The validator rejects mixed root files, multiple roots, duplicate normalized paths, empty names, absolute paths, drive and UNC paths, backslashes, NUL bytes, `.` and `..` segments, and entries other than regular files and directories. Archive filenames do not determine the skill name.

## Marketplace Metadata

`SKILL.md` uses the normal skill frontmatter and must provide a valid `name` and `description`. The descriptor name is the installation identity and must match an enclosing directory when one is present.

Optional display metadata belongs under `metadata.marketplace`:

```yaml
---
name: my-skill
description: One-sentence user-visible summary.
metadata:
  marketplace:
    version: 1.2.3
    author: DeepSeek
    tags:
      - tools
      - files
    banner: banner.webp
---
```

Version, author, tags, and banner values are bounded and strictly parsed. Unknown marketplace keys fail validation so misspelled fields do not silently change security or presentation behavior.

## Promotional Images

`metadata.marketplace.banner` names one normalized relative regular file inside the skill directory. PNG, JPEG, WebP, and GIF are supported; SVG is not.

Installation validates the filename extension, magic bytes, and size. `banner` repeats containment, regular-file, size, extension, and signature checks before returning base64 bytes and a media type, so external filesystem edits cannot turn a previously accepted path into an unsafe response. Public results never expose absolute Host paths.

## Fixed Security Limits

| Resource | Limit |
|---|---:|
| Decoded ZIP | 10 MiB |
| Regular files | 256 |
| One extracted entry | 30 MiB |
| Total extracted data | 30 MiB |
| Promotional image | 2 MiB |

These values are protocol security invariants, not deployment settings. Strict base64 decoding and the decoded-size limit run before ZIP parsing; streaming extraction enforces declared and observed sizes before publication and stops after a structural or resource failure.

## Structured Outcomes

Successful methods return typed values inside the generated Remote result. Expected failures use the closed `SkillMarketFailure` union, including invalid archives or descriptors, resource limits, unsafe entries, invalid banners, managed-upgrade confirmation, unmanaged conflicts, incompatible manifests, missing skills, and non-managed targets.

Callers switch on `error.code`; they never parse diagnostic text. An initial install does not replace an existing target. Only a valid managed target can return `managed-upgrade-required`, after which the caller may resubmit with explicit replacement intent. Unmanaged, malformed, incompatible, and name-mismatched targets remain untouched.

## Manifest Ownership

Every published marketplace installation contains `.dsh-market.json` with `schemaVersion: 1`, the exact skill name, normalized display and banner metadata, source filename, and installation timestamp. This strict manifest is the sole authority for upgrade and uninstall.

Listing omits directories with missing, malformed, incompatible, or name-mismatched manifests. Mutation rechecks the manifest while holding the skill lock and refuses uncertain ownership. Hand-placed skills remain discoverable through the filesystem provider but cannot be replaced or removed by the marketplace.

## Atomic Lifecycle

Operations serialize through an in-process mutex keyed by normalized skill name; unrelated names can progress independently. Validation that does not depend on target state may occur before the lock, while final ownership checks, publication or detachment, rollback, and the success decision occur while locked.

Install writes and verifies a private sibling staging directory, including the management manifest, before renaming it to an absent target. Upgrade renames the managed target to a sibling backup, publishes staging with an atomic same-filesystem rename, restores the backup if publication fails, and removes the backup only after success. Uninstall renames the managed target to a sibling tombstone before contained recursive cleanup.

After successful publication or detachment, the gateway emits `skill-filesystem/host-mutation` for the committed user-skill path. The filesystem provider uses its registration-owned invalidation path, so the next discovery read observes the installed, upgraded, or removed skill without relying on watcher timing. Validation failures, failed commits, and restored rollbacks emit no successful mutation notification.

Process crashes can leave reserved staging, backup, or tombstone siblings. Automatic crash-residue deletion is deferred until cleanup can be tied to durable transaction records; the service does not guess ownership from a reserved-looking filename.

## Model Experience

None, as archive validation and filesystem mutation do not change prompt projections, model requests, or session logs.

#### KV Cache effect

Marketplace operations do not add or modify request history.

## Known Limitations and Deferred Work

- Archives travel as base64 JSON in the first Remote version; the decoded ZIP limit bounds browser and Host memory use.
- One skill has at most one promotional image, and versions are display metadata rather than dependency or update policy.
- The marketplace does not provide a hosted registry, URL downloads, ratings, signing, dependency resolution, or automatic updates.
- It does not install project, preset, or bundled skills and does not execute skills during validation.
- It does not change filesystem skill precedence, agent-loop behavior, session events or formats, model requests, prompt projections, or the TypeScript and Python SDKs.
