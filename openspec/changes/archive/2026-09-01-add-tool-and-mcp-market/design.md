## Context

The existing Skill Market owns managed ZIP installation for filesystem-discovered skills. Digital employee configuration currently persists capability names and MCP declarations, validates them against live registries, and exposes raw JSON editors. Tool plugins can execute Host code, while MCP configurations can reference credentials, so neither can reuse the Skill Market's installation path unchanged.

## Goals / Non-Goals

**Goals:**

- Give users one marketplace experience for Skills, Tools, and MCP packages.
- Make template capability selection discoverable, searchable, and permission-aware.
- Keep tool executable content and MCP credentials under explicit trust and lifecycle controls.
- Reuse the Skill Market's managed-installation and atomic mutation patterns where their security model applies.

**Non-Goals:**

- Execute arbitrary uploaded JavaScript, shell scripts, or binaries in the running Host.
- Turn the marketplace into a public remote catalog, payment system, or publisher identity service in this change.
- Replace existing plugin-contributed tools, skills, or MCP clients.
- Remove the advanced JSON editors for experts, memory seeds, and delegation policy.

## Decisions

### Separate asset packages with a shared marketplace shell

Skills, Tools, and MCP packages share inventory, ZIP transfer, visual metadata, managed manifests, upgrade confirmation, uninstall, and Web navigation. Each asset type owns a distinct descriptor and resolver because skills are instructions, tools are executable capabilities, and MCP packages are connection definitions.

An alternative is one generic archive schema. It is rejected because it would blur the different trust, activation, and secret-handling rules.

### Trusted, restart-bound Tool activation

Tool packages are signed DSH plugin bundles from locally trusted publishers. Installation verifies the archive and publisher without evaluating its content. A successful mutation updates the managed inventory and marks the package restart-pending; a fresh Host composition resolves and mounts trusted packages. This prevents uploaded code from being dynamically evaluated in the already-running process.

An alternative is hot-loading tool package code after upload. It is rejected because it creates an arbitrary-code execution route and makes rollback and capability isolation unreliable.

### Declarative MCP packages plus credential references

An MCP package describes one or more permitted client configurations, transports, commands, fixed arguments, environment key names, and required credential-reference slots. The Host resolves references only while starting the owned MCP client and never includes secret values in marketplace, template, or publication records.

An alternative is accepting raw `cordis.yml` or arbitrary command configuration in the marketplace UI. It is rejected because it makes provenance, validation, and safe upgrades ambiguous.

### Catalog-driven template editing

The digital employee Host exposes one administrator-only catalog that joins installed skills, registered tools, and configured MCP clients with availability and permission summaries. The UI uses this catalog for searchable selectors and persists the existing capability/MCP reference data model. Existing raw references remain readable and become diagnostics if unavailable.

An alternative is letting the UI call every registry independently. It is rejected because the Host is the authority for availability, trust, restart state, credential safety, and employee authorization.

### Configuration and lifecycle boundaries

Marketplace package installation and per-user MCP credential-reference configuration occur before template authorization. Template publication validates only assets that are installed, activated, resolvable, and within the root employee authority. Uninstalling an asset used by a published template does not mutate that template; later preview, creation, or upgrade reports that the dependency is unavailable.

## Risks / Trade-offs

- [Tool activation needs a Host restart] → Show restart-pending state in the marketplace and prevent the tool from new template selection until a fresh Host resolves it.
- [A trusted publisher list has operational overhead] → Ship a local configuration format, a developer trust key path, and clear untrusted-publisher diagnostics.
- [MCP command descriptors can still be risky] → Restrict package descriptors to validated transports and fields; require trusted publishers and existing MCP client policy checks.
- [Asset removal can break a future template action] → Keep immutable references and show unresolved diagnostics instead of silently replacing or deleting them.
- [Three marketplaces can fragment navigation] → Use one Marketplace section with Skill, Tool, and MCP tabs and a shared search/filter model.

## Migration Plan

1. Keep the existing Skill Market storage and APIs working unchanged.
2. Add managed Tool and MCP directories and versioned manifests without importing legacy user-owned directories.
3. Add the unified template catalog and selectors while continuing to read existing draft JSON references.
4. Migrate the UI so new edits use selectors; retain unresolved legacy values as removable diagnostics.
5. Roll back by disabling the new marketplace plugins and selectors; existing plugin-contributed capabilities and published drafts remain intact.
