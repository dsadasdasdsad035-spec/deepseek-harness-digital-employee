# Agent Note: Direct MCP server configuration in the marketplace

Status: implemented

English | [中文](2026-09-04-mcp-marketplace-direct-config.zh.md)

## Problem

The market MCP tab accepted only signed ZIP packages. Connecting one remote MCP endpoint — or one local stdio server — required the publisher toolchain: build an archive, hash the file table, sign it with Ed25519, and upload. For a user who vouches for their own server, the packaging ceremony adds no safety while blocking the common case.

## Decision

The MCP tab gains a direct-configuration surface next to the package uploader: create, edit, and delete user-declared servers over either transport. The market service owns a reference-only store (`.mcp-direct-configs.json` under `installRoot`), and the gateway hot-mounts on save and unmounts on delete through the same `McpClientManager` mount the package path uses — direct mutations are not restart-bound.

Security rules transfer where they mean the same thing: credential slots keep the empty-fixed-value rule, stdio commands stay within `stdioInterpreters`, and every stdio save requires the same `confirmLocalExecution` disclosure as a package install. What does not transfer is the file table: a direct entry has no signed payload, so its arguments may name absolute paths on the user's disk and its `cwd` — user-declared and checked to exist at save time — replaces the managed package directory. The user vouches for the entry the way they would for a cordis.yml entry; the disclosure modal states this on the save path, not only at install.

Server names are unique across direct entries and managed packages in both directions, checked inside the market service's keyed mutex. A same-name edit releases the namespace before remounting (the manager rejects concurrent duplicate reservations); a rename mounts the new name before releasing the old one, so a failed mount leaves the previous server live, the record untouched, and the entry degraded with a diagnostic.

## Alternatives considered

- **Browser-generated unsigned packages**: zero backend change, but the result is still a package — inventory noise, restart semantics, and a signature dialog implying an attestation that does not exist.
- **Direct HTTP only**: cheaper, but it splits the surface — local servers stay behind the publisher toolchain even for the user who wrote them.
- **Write the mcp-client cordis.yml config**: declarative config is load-time, not runtime-mutable; hot reload would need file-watch semantics and a restart anyway.

## Consequences

Direct configuration is a power-user path with a power-user risk profile: the confirmation gate covers the subprocess decision, but the code executed is whatever the user named. Package installs and direct saves share one namespace, so a package cannot silently shadow a direct entry or vice versa. Resolved credential values remain mount-call-local; direct entries persist reference names only. The restart-bound model still governs packages — only direct configuration is immediate.
