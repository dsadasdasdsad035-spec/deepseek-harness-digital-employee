## Context

See [proposal.md](proposal.md) for the motivation. `project-manager-test` currently exports an Atlas memory fixture for tests but the template schema has no initialization field, so management-created instances do not receive it. The template already supports named experts, capability allowlists, instruction sources, and bounded delegation.

## Goals / Non-Goals

**Goals:**

- Make template-owned initial long-term memory part of durable employee creation rather than a test-only manual operation.
- Give the project-manager test employee one usable, least-privilege Risk Reviewer expert.
- Keep all fixture behavior deterministic, offline, and free of credentials.
- Surface the resulting memory and expert through the existing management APIs and views.

**Non-Goals:**

- Add user-authored memory seeds or editable expert definitions in the Web UI.
- Change memory-promotion policy for model-authored memories.
- Grant the Risk Reviewer generic subagent delegation, write access, network access, or credentials.
- Turn the fixture into a production project-management provider.

## Decisions

### Add declarative template memory seeds

The digital employee template model will declare portable, non-secret initial long-term memory candidates. The durable employee provider will materialize each seed during creation in the same persisted update as the employee instance, adding the new employee ID and creation provenance.

This makes initialization available to any trusted template and ensures an employee cannot be observed without its required seed. A package-specific listener would require fixture-aware Host behavior and would risk an instance being created before the seed write succeeds. Reusing normal model-facing memory promotion would make deterministic creation subject to duplicate and policy decisions intended for live Agent output.

### Seed only new instances

Existing project-manager test employees keep their current memory unchanged. The initial-memory declaration applies at creation time and is never re-applied during activation, template listing, task start, or upgrade.

This preserves the meaning of durable memory as instance-owned history. Backfilling existing employees would introduce unrequested state changes and make an upgrade implicitly mutate user data.

### Declare one bounded Risk Reviewer expert

The template will declare a stable `risk-reviewer` expert with a package-owned instruction file. Its capability allowlist will contain the `risk-review` skill, the existing read-only project evidence tools, and the `project-data` MCP server. Its delegation policy will use a maximum depth of zero and no child experts or generic subagents.

The root employee will list `risk-reviewer` in its authorized experts and retain a maximum delegation depth of one. This allows a root task to delegate one review while preventing the expert from expanding authority or creating descendants. A pair of planning and risk experts is deferred because one risk expert demonstrates the composition path without expanding the fixture's behavioral matrix.

### Keep existing management surfaces

The existing employee detail views already load long-term memories and template-authorized experts. The change will use those paths rather than add fixture-specific UI state; Web bundle composition tests will prove the complete package registration.

## Risks / Trade-offs

- [Template schema expansion affects every provider] → Validate seed records at template registration and add provider tests for atomic creation and employee isolation.
- [Creation may fail while storing seeds] → Treat instance and seed persistence as one mutation so no partial employee survives.
- [A deterministic seed could conceal real memory behavior] → Keep it non-sensitive, attributable, and distinct from model-authored promotion tests.
- [Expert capabilities could broaden unintentionally] → Assert exact capability lists and rejection of further delegation in focused and assembled tests.

## Migration Plan

1. Deploy the template schema and durable creation support together.
2. Register the new project-manager test template revision in the Web development bundle.
3. Existing instances remain on their current revision and memory records; new instances select the new revision.
4. Roll back by removing the new template revision from the bundle; already-created instances retain their durable records and continue to require their installed template version.
