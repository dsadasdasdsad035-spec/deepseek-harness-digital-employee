# Agent Note: The digital employee suite owns the marketplace, employee, and company domains

Status: implemented

English | [中文](2026-09-22-suite-owns-market-employee-company-rows.zh.md)

## Problem

`dsh-digital-employee-suite` shipped as an optional extension while `dsh-web-app` still baked in every marketplace, digital employee, and company row. No independently installable unit existed: on a lean Web bundle the suite installed nothing, and the three domains could not be handed to another deployment as one plugin.

## Decision

Ownership flipped. The suite's `cordis.patch.yml` now owns the six marketplaces (Skill/Tool/MCP/Hook/Workflow/Subagent), the digital employee runtime with SQLite persistence and management (keeping the `studioFile` default), and the company module with its file store, management gateway, and group chat, plus the three browser rows (`ui-skill-market`, `ui-digital-employees`, `ui-companies`). `dsh-web-app` keeps the shared `api-remotes` carrier, the generic browser surface, and no domain dependency. `PROFILE_TEMPLATES.web` composes `[dsh-base, dsh-web-app, dsh-digital-employee-suite]` so the shipped surface is unchanged, and the pre-split `[dsh-base, dsh-web-app]` tuple is registered in `INSTALLATION_OWNED_PROFILE_TUPLES` so existing web profiles normalize on next load; any customized list stays user-owned. The suite joined `apps/cli`'s dependency closure so `healProfilesModuleFallback` links every domain package for in-box resolution, and the assembled harnesses (jsdom assembled boot, Web e2e scaffold, Web presets e2e) compose the same three-layer stack.

## Alternatives considered

- **Restate the rows in the suite while the Web bundle keeps them:** Rejected; installing the suite on the shipped composition would be a no-op override, so nothing would actually be installable.
- **Split into three bundles (markets, employees, companies):** Rejected; consumers want one capability set and one install command, and Template configuration already depends on the marketplace catalogs.
- **Keep the domains in the Web bundle and not ship an installable unit:** Rejected; it is the state that motivated the flip and leaves no distribution story.

## Consequences

Out-of-tree deployment installs all three domains with `dsh plugin --profile <name> add @qq296629801/dsh-digital-employee-suite`. A Web-only profile boots a generic console: the client still mounts every remote namespace (the `api-remotes` set is fixed at build time), and a call whose domain Host row is absent fails dispatch with `service-unavailable` — the same shape as any unmounded host row, and the domain browser rows that would issue those calls are equally absent. Existing web profiles normalize to the three-layer template automatically; rollback removes the suite from the profile and restores the generic surface without touching `$DSH_HOME` data. The superseded Web bundle composition specs were deleted and the suite spec rewritten, which also cleared their pre-existing drift around the retired `digital-employee-file` provider.
