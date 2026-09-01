# Agent Note: Trusted Tool and MCP marketplaces

Status: implemented

English | [中文](2026-08-31-tool-and-mcp-marketplace.zh.md)

## Problem

Skill installation alone does not give administrators a safe acquisition path for executable Tools or credential-backed MCP clients. Free-form identifiers in digital employee templates also hide availability, permissions, restart state, and unresolved dependencies.

## Decision

The Web Marketplace contains Skill, Tool, and MCP tabs. Tool and MCP packages use separate versioned descriptors over a shared bounded-ZIP, normalized-path, managed-manifest, SHA-256 file-table, Ed25519 trust, keyed-mutation, and atomic-publication implementation.

Tool upload and installation never evaluate package code. A successful install, upgrade, or uninstall reports a restart requirement. Fresh Host composition revalidates the installed descriptor, signature, and file hashes before importing the Tool plugin entry.

MCP packages are declarative Streamable HTTP definitions. Configuration persists credential reference names only; resolved values exist only while `McpClientManager` mounts a configured server. Activation is atomic per package: every declared server must mount before the package becomes available, and a later failure disposes earlier mounts in reverse order. Marketplace inventory, template records, diagnostics, and Remote responses omit resolved values.

The digital employee configuration studio consumes one administrator catalog that joins installed Skills, registered Tools, managed MCP configurations, and unresolved existing references. New selections require available assets within employee authority. Existing unresolved values remain removable diagnostics and do not erase expert, memory, or delegation configuration.

Publisher templates include descriptor examples, signed file-table inputs, permission declarations, credential-reference-only MCP headers, and signing instructions. The Web bundle reads trusted publisher records from `DSH_MARKET_TRUSTED_PUBLISHERS`.

## Alternatives considered

- **Hot-load uploaded Tool code**: this gives an archive mutation immediate code-execution authority and makes rollback unable to restore the running process.
- **Accept arbitrary MCP commands or raw configuration**: this prevents stable validation and allows package data to mix connection declarations with credentials or executable behavior.
- **Keep capability identifiers as free-form template JSON**: this cannot present authoritative availability and permission state or prevent accidental unresolved grants.
- **Use one generic descriptor for every asset type**: shared fields do not remove the different activation, credential, and permission rules of Skills, Tools, and MCP clients.

## Consequences

Administrators can acquire and authorize each capability type through discoverable inventory while Host-owned validation preserves managed-directory ownership and credential secrecy. A package never exposes only a subset of its MCP servers after activation failure. Tool and MCP changes are not immediately active, and deployments must maintain trusted publisher keys and restart the Host after package lifecycle changes. MCP transport support is limited to Streamable HTTP.
