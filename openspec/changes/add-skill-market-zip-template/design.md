## Context

See `proposal.md` for motivation and `specs/skill-market-zip-template/spec.md` for required behavior. The marketplace already accepts ZIP uploads, inspects entries before publication, parses `SKILL.md`, and exposes an upload action in the Web UI. It does not provide an archive that authors can download and adapt.

## Goals / Non-Goals

**Goals:**

- Ship one small, human-readable, directly uploadable example ZIP.
- Keep the package structure aligned with existing archive and descriptor validation.
- Make the download discoverable alongside the marketplace upload workflow.
- Prove the delivered bytes work through the production marketplace installation path.

**Non-Goals:**

- Generate personalized ZIP files at runtime.
- Provide a package authoring wizard or validate author changes before upload.
- Expand supported archive formats or relax archive safety limits.
- Add executable code, dependencies, or network behavior to the template.

## Decisions

### Version a static archive with source template files

The implementation will retain the author-readable source files next to a generated ZIP asset in the Web package. A deterministic package script or test helper will produce the checked-in archive, and a test will reject drift between source files and delivered bytes.

This makes the download immediately available to the static frontend while preserving an auditable source representation. Runtime ZIP generation was rejected because it adds Host behavior and a second serialization path for a small fixed asset. Shipping only a source directory was rejected because it fails to demonstrate the actual download and upload workflow.

### Put the download action in the marketplace upload surface

The UI will add a compact download control near the ZIP chooser so an author can find the example at the moment they need packaging guidance. It will use the existing frontend asset delivery path and normal browser download behavior.

Adding a separate route or Host RPC was rejected because no per-user data or runtime decision is involved. Hiding the asset in documentation was rejected because it separates the template from the upload flow it teaches.

### Keep the archive intentionally minimal and safe

The archive root will contain `SKILL.md`, a Markdown reference example, and a short package note if needed. It will not contain symlinks, executable files, nested archives, or tool-generated output. `SKILL.md` will use a unique stable name so the installation test does not collide with fixtures.

This keeps the template inside the marketplace's existing file-count and size limits and makes each file useful to an author. A richer demonstration package was rejected because optional complexity would obscure the required package convention.

### Verify delivered bytes through the existing market service

Tests will read the checked-in ZIP and submit it through the same install operation used by uploads, using an isolated user skill directory. A UI-facing test will assert that the download action points to the shipped asset.

Directly testing only the source directory was rejected because it cannot detect ZIP packaging drift. Reimplementing archive assertions in the template test was rejected because the marketplace validator is the authoritative behavior.

## Risks / Trade-offs

- [Risk] Checked-in binary assets can drift from their readable source files. -> Mitigation: generate deterministically and assert byte-level package contents in tests.
- [Risk] The example name may collide with a user-installed package during manual verification. -> Mitigation: use a distinct template name and isolate test homes.
- [Risk] The static asset may not be included in the built frontend. -> Mitigation: cover the production asset path in the built Web composition test.

## Migration Plan

1. Add the source template files, generated ZIP, and download control.
2. Verify archive validation, isolated installation, and shipped frontend asset inclusion.
3. Release the asset with the Web bundle; existing marketplace installations need no migration.

Rollback removes the download action and its static asset together. No persisted data or archive format changes require migration.
