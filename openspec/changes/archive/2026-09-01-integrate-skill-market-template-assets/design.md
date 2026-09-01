## Context

See `proposal.md` for motivation. Template configuration currently receives skills from the runtime registry, while the skill marketplace owns a separate managed-installation inventory containing version, author, tags, banner presence, and installation time. Runtime registration is authoritative for whether an employee Agent can use a skill; marketplace presence alone only proves that managed files are installed.

The digital employee management Gateway already projects skills, Tools, and MCP clients into one client-safe asset catalog. The browser stores only those projected assets and template drafts store skill names.

## Goals / Non-Goals

**Goals:**

- Give template configuration one authoritative merged skill list.
- Preserve the runtime registry as the source of truth for selectability.
- Enrich marketplace-managed entries with commercial display metadata.
- Keep stale selected skills visible and removable.
- Prove the assembled marketplace-to-template workflow through real Web E2E coverage.

**Non-Goals:**

- Pin a template to a marketplace package version.
- Copy marketplace metadata into published employee templates.
- Let template configuration install, upgrade, or uninstall skills.
- Load skill banners in the initial catalog response.
- Change skill ZIP validation or marketplace transaction behavior.

## Decisions

### The Host Gateway performs the merge

The digital employee management Gateway will request the runtime skill list and the optional skill marketplace inventory, index both by skill name, and return their union as configuration assets. This keeps availability, security filtering, and source classification in one Host-owned projection.

The alternative was to let the browser call both Remotes and merge results. That would duplicate policy in the client, expose transport failure combinations to the UI, and make validation disagree with display more easily.

### Runtime registration determines selectability

An entry is selectable only when the runtime skill registry contains its name. A marketplace-only entry remains visible but unavailable and carries a diagnostic indicating that Host activation or restart is required. This separates “installed on disk” from “usable by the current Agent runtime.”

The alternative was to treat every marketplace installation as available. That would let an administrator publish a template that validation and task composition cannot resolve.

### Marketplace inventory enriches rather than replaces runtime data

For a name present in both sources, runtime description and availability are combined with marketplace version, author, tags, managed source, and restart status. A runtime-only name remains a selectable local skill. A marketplace-only name remains an unavailable managed skill. The response contains no Host paths or archive filenames.

The join key is the stable skill name because templates already authorize skills by name and the marketplace manifest enforces the same identity.

### Stale draft selections are synthesized in the editor

The catalog represents current inventory. When a draft contains a selected name absent from the catalog, the editor will synthesize an unavailable selected row from the draft reference. That row can only be deselected. Validation remains the authoritative publication gate.

The alternative was to make the catalog request draft-specific. That would couple inventory caching to each draft and mix current installation facts with durable user state.

### Published templates continue to store skill names

Marketplace metadata is presentation and provenance data, not part of the employee authority. Upgrading a managed skill therefore updates what a name resolves to without rewriting every template publication. Existing validation continues to reject unresolved names.

## Risks / Trade-offs

- [Marketplace inventory is temporarily unavailable] → Return runtime skills as local entries and keep template validation based on runtime availability; surface marketplace metadata only when the inventory call succeeds.
- [A skill is installed immediately before activation] → Show the managed entry disabled with restart guidance until the runtime registry exposes it.
- [Marketplace and runtime descriptions differ] → Prefer the runtime description for executable behavior and use marketplace fields only for provenance metadata.
- [A marketplace skill is uninstalled while an editor is open] → Revalidation before publication rejects the stale reference; a refreshed editor shows it as removable and unavailable.
- [Metadata increases catalog payload size] → Project text metadata only; defer banners and other binary assets to existing on-demand marketplace endpoints.

## Migration Plan

1. Extend the client-safe configuration asset projection with optional skill marketplace metadata.
2. Update the Gateway merge while preserving runtime-only skill entries.
3. Update the editor to render metadata and synthesize stale selected rows.
4. Deploy Host and Web changes together because the generated Remote types change in the same release.
5. Roll back both surfaces together; persisted drafts remain compatible because their skill-name representation does not change.
