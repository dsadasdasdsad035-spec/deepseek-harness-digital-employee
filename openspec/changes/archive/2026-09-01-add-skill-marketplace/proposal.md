## Why

DeepSeek Harness can discover user skills from the filesystem, but it has no durable, user-facing way to inspect packaged skill metadata, install a reviewed archive, upgrade an existing installation, or remove only content that the product owns. A skill marketplace closes that lifecycle gap while preserving the filesystem provider as the discovery authority and treating uploaded ZIP files as hostile input.

## What Changes

- Add a Host-side skill marketplace Typert Remote that accepts ZIP uploads over the existing trusted `/api` carrier, validates archive structure and resource limits, and installs skills atomically into the user DSH skill directory.
- Record a versioned management manifest inside each marketplace installation so listing, upgrades, banner reads, and uninstall operations act only on directories owned by the marketplace.
- Support explicit same-name upgrades with rollback on commit failure; reject accidental replacement and refuse to uninstall hand-managed skills.
- Invalidate skill discovery after successful install, upgrade, or uninstall so the existing skill registry observes filesystem changes without a process restart.
- Add a Web settings section that displays installed skill names, descriptions, versions, authors, tags, and promotional images; supports search, ZIP upload, upgrade confirmation, uninstall confirmation, loading, empty, success, and failure states.
- Wire the Host and browser plugins into the shipped Web bundle and application dependency graph.
- Add package-level security and lifecycle tests, a real Loader-composed Host test, and keyless Web browser coverage for the assembled marketplace workflow.
- Document the Host and Web package behavior, persistent manifest, limits, failure cases, model-visible effects, and deferred work, with a non-trivial Agent Note.

## Capabilities

### New Capabilities

- `skill-market-management`: Trusted Host operations for validating, atomically installing, upgrading, listing, reading promotional images from, and uninstalling marketplace-managed skill bundles in the user skill directory.
- `skill-market-web`: A localized Web settings experience for browsing installed marketplace skills and performing upload, upgrade, and uninstall workflows with visible status and confirmation.

### Modified Capabilities

None.

## Impact

- New product packages under `packages/skill/` and `packages/client/`, with package manifests, TypeScript project references, invariants, READMEs, and tests.
- Web composition changes in `packages/bundle/web-app/`, application dependency updates in `apps/cli/`, and assembled browser tests under `apps/web/`.
- Integration with the existing Typert Remote assembly over the Connection-backed `/api` carrier and the filesystem provider's catalog invalidation mechanism; the skill registry and filesystem provider remain the discovery and loading authorities.
- Durable data under `$DSH_HOME/skills/<skill-name>/` gains a marketplace-owned management manifest. Unmanaged directories and incompatible manifests remain outside marketplace mutation authority.
- ZIP parsing uses a maintained archive dependency with bounded extraction; no model request, session event, prompt content, or SDK protocol changes are introduced.
