## Context

See `proposal.md` for motivation.

Digital employee management already separates registered template versions from durable employee instances and exposes typed Host/Web operations for instance lifecycle, memory, expert work, upgrades, and audits.

Template contributions are currently installed through plugins. The configuration studio needs locally authored templates without weakening immutable-version resolution, explicit capability authorization, or credential isolation.

The first release runs locally with one administrator. It has no authentication, organization, or collaborative-editing provider.

## Goals / Non-Goals

**Goals:**

- Add durable template drafts and immutable locally published versions.
- Reuse the current template resolution and employee upgrade paths for published versions.
- Keep ordinary employee users in the existing operations workspace.
- Validate configuration before any preview or publication.
- Keep credentials, preview state, and draft-only state out of employee exports and durable employee records.

**Non-Goals:**

- Introduce a general-purpose visual workflow editor.
- Store or edit credential values in the browser.
- Add multi-user roles, collaborative drafts, approvals, marketplace publishing, or remote synchronization.
- Modify the behavior of existing plugin-contributed template versions.

## Decisions

### Add a configuration-studio service beside employee operations

The management Host exposes a distinct typed configuration-studio namespace rather than adding draft mutation methods to instance lifecycle services.

This keeps employee operations understandable for ordinary users and permits a narrow administrator gate at the remote API boundary.

Alternative considered: use the existing template registry as a mutable draft store. Rejected because the registry represents resolvable immutable runtime versions, while drafts are incomplete and intentionally unresolvable.

### Store draft and published records in a local durable provider

The studio persists versioned draft records and publication provenance in a local provider that is separate from employee instances and session logs.

Publication materializes a complete template version into the existing resolution catalog while retaining its provenance record in the studio provider.

Alternative considered: persist drafts inside each employee instance. Rejected because one draft must be reusable before any employee exists and changes must not mutate existing instances.

### Use a complete validation result before preview and publish

Validation resolves every referenced capability and enforces parent-to-expert authority containment, delegation constraints, unique MCP server names in the composed employee, valid identifiers, mandatory agent instructions, and credential-reference-only data.

Preview and publishing take a validated draft revision identifier so a later save cannot silently change what is previewed or published.

Alternative considered: validate while composing a preview or an employee session. Rejected because administrators need actionable diagnostics before activating a runtime, and partial composition risks leaking transient state.

### Build previews from ephemeral composition

Preview uses the normal employee composition path with a temporary instance identity, isolated memory namespace, and explicitly marked preview session.

Preview data is deleted at termination and is excluded from instance lists, exports, upgrades, and normal audit history.

Alternative considered: preview against a real inactive employee instance. Rejected because test runs and exploratory memory writes must never contaminate business data or be mistaken for active work.

### Publish immutable versions and reuse upgrade review

Publishing assigns a monotonically ordered local version for a stable template ID and produces an immutable version record.

The management UI uses the existing template list and upgrade comparison mechanisms, so published versions enter employee creation and upgrades without a second upgrade policy.

Alternative considered: edit published versions in place. Rejected because it would make employee behavior drift and remove the reviewable upgrade boundary.

### Materialize authored instructions before publication

The studio persists draft instruction text in its private document. Publishing writes that text to a version-owned `AGENTS.md` file under the private studio directory and registers the resulting immutable file instruction source with a content digest.

Alternative considered: add an inline instruction source to the runtime template model. Rejected because the runtime already uses file-backed instruction provenance and the new inline form would create a second composition path.

### Gate the studio through explicit local administrator configuration

The Host configuration has a validated local administrator mode. The Web client receives only the configuration-studio operations it is allowed to invoke, and hides the studio navigation otherwise.

Alternative considered: infer administrator status from a local browser setting. Rejected because browser state is not an authorization source and cannot protect Host mutation operations.

## Risks / Trade-offs

- [Draft schema becomes tightly coupled to runtime template schema] -> Use one typed conversion at publication and reject incomplete drafts before conversion.
- [Capability catalogs change between validation and publication] -> Bind validation to a draft revision and revalidate against the current catalog immediately before publishing.
- [Preview invokes external tools or MCP clients] -> Apply the same authorization policy as the employee and require preview-specific approval defaults; document that preview has side effects only when explicitly authorized.
- [Local version allocation races] -> Allocate publication versions atomically in the durable studio provider.
- [Browser visibility is mistaken for authorization] -> Enforce administrator access in Host operations before returning or mutating configuration data.

## Migration Plan

1. Add the studio provider, typed Host/Web requests, and the disabled-by-default administrator configuration.
2. Add local published template resolution without changing plugin template behavior.
3. Add draft validation, preview isolation, and publishing.
4. Add configuration-studio Web views behind the administrator gate.
5. Add focused Host/Web tests and an assembled snapshot, then enable the administrator configuration in a runnable example.

Rollback disables the configuration-studio plugin or administrator mode. Existing employee instances and plugin templates continue resolving because they do not depend on draft records. Locally published versions remain durable data and can be re-enabled when the plugin returns.

## Open Questions

- The exact local administrator configuration syntax can follow the repository's existing settings and feature-gate conventions during implementation.
