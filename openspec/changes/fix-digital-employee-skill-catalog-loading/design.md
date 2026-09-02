## Context

The `skill.list` Host RPC supplies composer/catalog data, while the model-facing `skill` tool loads one skill by exact name. Digital employee composition mounts the selected preset, restricts skills and tools to the employee authority, and then conditionally mounts the skill tool. The failure occurs when the model asks the loader for `list`, which indicates that the runtime prompt/catalog and loader contract are not being observed together.

## Goals / Non-Goals

**Goals:**

- Make the employee's scoped, authorized skill catalog available before its first model request.
- Keep catalog discovery and individual skill loading as separate, observable operations.
- Preserve exact authorization and produce a useful diagnostic for stale or invalid names.
- Add assembled coverage that proves marketplace and local skills survive employee composition and are actually loadable.

**Non-Goals:**

- Adding a new RPC for model-side skill discovery.
- Treating `list` as an alias or fallback skill name.
- Changing ordinary `@` mention syntax or general skill invocation for non-employee sessions.

## Decisions

1. **Publish the catalog from the employee Agent scope.** The catalog must be derived after preset mounting and skill restriction, using the same scoped registry the loader uses. This prevents Host-global skills from appearing as available and prevents the loader from seeing a different set than the prompt.

2. **Keep `skill.list` and `skill` separate.** `skill.list` remains a Host/client catalog RPC. The model-facing `skill` tool accepts only `{ name }`, validates that exact name against the current scoped catalog, and never interprets reserved words such as `list`.

3. **Use the existing durable catalog lifecycle.** Initial publication and replacement messages remain session-visible and are refreshed when the scoped catalog changes. The employee startup path must ensure this lifecycle runs before the first model request rather than relying on a later ordinary turn.

4. **Test the assembled runtime, not only isolated registries.** Extend the keyless digital employee fixture with a deterministic model call for an authorized skill and an invalid `list` call, then assert catalog contents, successful exact-name loading, rejection, and employee attribution. Add Web coverage for the `@` startup path and the first session prompt.

5. **Diagnose rather than broaden authority.** If the catalog is unavailable or incomplete, retain the last complete catalog where the existing lifecycle permits it and fail the loader for names not present. Do not fall back to the unscoped registry or silently map `list` to a skill.

## Risks / Trade-offs

- [Risk] Catalog publication before the first request can add prompt tokens. -> Publish only the scoped model-invocable summaries and reuse the existing digest/replacement suppression.
- [Risk] Preset recomposition can leave stale durable catalog messages. -> Compare the current scoped snapshot with the durable catalog source and publish a complete replacement when the digest changes.
- [Risk] A fixture may pass while the browser path differs. -> Include a real Web E2E assertion on the routed employee Session and its first model-visible request.
- [Risk] Existing resumed Sessions may contain an old catalog. -> Treat the current scoped snapshot as authoritative and replace stale entries before the next model request.

## Migration Plan

1. Implement the scoped startup/catalog changes and focused tests.
2. Run the assembled keyless fixture and Web E2E checks.
3. Deploy/restart the Web service; existing employee Sessions refresh their catalog on the next eligible pre-step.
4. Roll back by reverting the runtime/catalog change; no durable data migration is required.
