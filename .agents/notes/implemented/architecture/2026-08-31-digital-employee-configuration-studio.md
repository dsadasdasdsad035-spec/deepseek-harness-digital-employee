# Agent Note: Digital employee configuration separates mutable drafts from immutable runtime versions

Status: implemented

English | [中文](2026-08-31-digital-employee-configuration-studio.zh.md)

## Problem

Local administrators need to author reusable digital employee templates without exposing capability design, credential handling, and publishing mechanics to ordinary employees. A draft can be incomplete and repeatedly edited, while an employee instance requires a stable, resolvable template version with reviewable authority.

## Decision

The management Host enables the configuration studio only when its local `administrator` configuration is true. A private `studioFile` stores mutable drafts and publication provenance, while the existing digital employee registry owns immutable runnable versions. Each publication revalidates the selected draft revision, materializes authored root and expert instructions into a version-owned directory, and registers the resulting file-backed template version. Durable publication is the commit point: a failed `studioFile` write unregisters the candidate and removes its materialized directory, so a retry receives the same next version.

Preview composition uses the same employee Agent Consumer with a temporary instance, preview-marked Session, isolated ownership, and a temporary materialization directory. Explicit disposal or management-plugin teardown waits for the Agent to stop and removes the files. Published template registrations are also owned by the management plugin and leave the runtime registry during teardown. Preview Sessions stay out of ordinary Session subscriptions and do not persist employee memory.

Locally published versions remain selectable through the existing template list, employee creation, and explicit upgrade review. Memory seeds are stored with the publication and promoted with configuration provenance only after the employee instance exists. If any seed cannot be promoted, creation deletes the new instance.

## Alternatives considered

- **Use the template registry as the draft store**: registry entries must be complete and immutable so execution and upgrade review can resolve exact versions.
- **Keep authored instructions inline in runtime templates**: runtime instruction provenance is file-backed, and a second inline form would create a different composition path.
- **Preview with a durable inactive employee**: exploratory Sessions and memory activity could become visible as business data.
- **Write memory seeds before employee creation**: memory ownership requires an instance identity, and failed creation would leave orphaned records.

## Consequences

Administrators get a local authoring workflow without a browser-held credential store or mutable template versions. Ordinary users keep the existing operations workspace. Publishing creates material owned by a concrete version, failed commits leave no registered version, previews and registrations clean up deterministically, and upgrades retain their explicit review step. Focused Host and Web tests plus an assembled keyless snapshot pin draft validation, commit rollback, teardown disposal, version resolution, creation-time memory promotion, and upgrade review.
