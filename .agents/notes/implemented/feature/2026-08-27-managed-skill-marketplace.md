# Agent Note: Managed skill marketplace

Status: implemented

English | [中文](2026-08-27-managed-skill-marketplace.zh.md)

## Problem

Users need a durable browser workflow for inspecting and changing skills in the DSH user directory without granting the browser filesystem authority or allowing marketplace operations to overwrite hand-managed content. Uploaded ZIP data is hostile input, and filesystem discovery must never observe a partial installation.

## Decision

The marketplace is a Host-owned capability with a generated client API and a localized settings contribution. The Host validates archives and promotional images, establishes management authority from a versioned manifest, serializes conflicting target changes, publishes or detaches directories with same-filesystem renames, and notifies the filesystem skill provider after a successful mutation.

## Typert Remote

`@deepseek-ai/dsh-skill-market` exposes `list`, `install`, `banner`, and `uninstall` through the generated `skillMarket` Typert Remote over the shared `/api` carrier. Client-safe request, result, inventory, identity, and failure types flow through `@deepseek-ai/dsh-api-remotes`, and the Web package calls `ctx.remote.skillMarket`.

Expected business failures are a closed discriminated outcome union. Carrier failures, cancellation, and unexpected implementation errors remain rejected calls. This distinction keeps localization and control flow independent of diagnostic prose and avoids a second RPC lifecycle beside the generated API.

## Manifest Authority

`.dsh-market.json` schema version 1 is the sole mutation authority. A target is managed only when the manifest is a regular file, parses strictly at the supported version, and names the exact target skill. Listing omits uncertain targets; upgrade and uninstall refuse missing, malformed, incompatible, and name-mismatched manifests.

The public inventory omits absolute Host paths. Hand-managed directories remain discoverable through the filesystem provider while staying outside marketplace replacement and recursive deletion authority.

## Keyed Transaction Lifecycle

An in-process mutex keyed by normalized skill name covers the final ownership check, commit or detach, rollback, and success decision. Operations for different names can proceed independently, and lock entries disappear after the final waiter leaves.

Install verifies a private sibling staging directory before an atomic rename to an absent target. Upgrade renames the managed target to a sibling backup, publishes staging, restores the backup on publication failure, and deletes the backup only after success. Uninstall detaches the managed target to a sibling tombstone before contained cleanup. Reserved transaction names are outside valid skill-name syntax, so discovery does not treat residue as a skill.

## Filesystem Provider Invalidation

Successful install, upgrade, and uninstall detachment emit the typed `skill-filesystem/host-mutation` root event for the committed user-skill path. The filesystem provider routes the event through its registration-owned invalidation mechanism, so the next discovery read observes the change without depending on watcher timing.

Validation failures, failed commits, and restored rollbacks emit no successful mutation notification. Filesystem watchers remain an additional observation path, and duplicate invalidation is harmless cache eviction.

## Security Limits

The Host strictly decodes base64 and uses streaming ZIP processing with fixed limits: 10 MiB decoded archive data, 256 regular files, 30 MiB for one extracted entry, 30 MiB total extracted data, and 2 MiB for one promotional image. These values are protocol security invariants rather than deployment settings.

Bundle paths reject traversal, absolute, drive, UNC, backslash, NUL, dot-segment, duplicate, mixed-root, and non-regular entries. Promotional images support PNG, JPEG, WebP, and GIF and must pass path, regular-file, size, extension, and magic-byte checks during installation and every later read. Validation never executes archive content.

## Browser Workflow

The Web package contributes a localized settings navigation item and section through client slots. A snapshot store owns inventory, local metadata search, ZIP preflight and encoding, managed-upgrade confirmation, confirmed uninstall, lazy promotional-image loads, progress, notices, retries, and localized failure states.

The initial install omits replacement intent. Only `managed-upgrade-required` retains the encoded candidate and offers confirmation; unmanaged or incompatible targets have no override action. Generation guards prevent superseded async operations from publishing, and cancellation, successful replacement or removal, and disposal release retained archive or image data.

## Crash Residue

The running transaction contains cleanup failures and logs diagnostics, but a process crash can leave staging, backup, or tombstone siblings. Startup does not delete paths merely because their names look reserved. Automatic recovery remains deferred until each cleanup decision can be tied to a durable transaction record.

## Unchanged Product Planes

The marketplace mutates the existing user skill directory and delegates discovery to the filesystem provider. It adds no session events or format changes, model-request inputs, prompt projections, agent-loop behavior, or TypeScript and Python SDK changes.

## Alternatives considered

**Independent Connection channel.** A dedicated `/skill-market` route would duplicate routing, lifecycle, generation, and error handling already supplied by Typert Remote.

**Errors encoded in messages.** Parsing diagnostic prose would couple browser control flow and localization to unstable text instead of exhaustive types.

**Any user-directory skill is managed.** Directory location alone cannot authorize replacement or recursive deletion of user-authored content; the strict manifest provides explicit ownership.

**Direct extraction into the target.** Discovery could observe partial or rejected files, and rollback could not restore a complete prior installation.

**One global marketplace lock.** Independent skill names do not share target state, so global serialization would reduce concurrency without improving correctness.

**Delete reserved-looking paths at startup.** Filenames alone do not prove transaction ownership after a crash; durable records are required before automated residue recovery is safe.

**Browser-side extraction and writes.** Browser validation cannot establish Host filesystem authority and would bypass the provider-owned discovery lifecycle.

## Verification

Package tests pin archive and image validation, fixed resource limits, strict manifest parsing, deterministic inventory, keyed concurrency, rollback, cleanup, and managed-only uninstall. Remote and filesystem-provider tests pin structured outcomes and post-commit invalidation. Client store, component, locale, slot, stale-response, and browser assembly coverage pins the localized workflow through the generated API.

## Consequences

The design gives the browser a stable typed workflow while keeping hostile input and destructive authority on the Host. Hand-managed skills fail closed, and discovery observes only complete committed targets.

Base64 duplicates bounded archive data, per-process locks do not coordinate multiple Host processes, and crashes can leave reserved sibling residue. Streaming transport, cross-process coordination, and durable crash recovery can evolve without changing manifest ownership or publication semantics.
