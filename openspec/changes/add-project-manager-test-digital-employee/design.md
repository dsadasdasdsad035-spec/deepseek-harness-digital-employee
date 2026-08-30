## Context

See `proposal.md` and the existing digital employee template, capability, and memory specifications. The current `digital-employee-template` example intentionally contains no skills, tools, or MCP servers, so it cannot exercise the complete employee composition path requested here.

## Goals / Non-Goals

**Goals:**

- Add one package-owned, versioned project-manager test template whose capability declarations are complete and deterministic.
- Reuse existing digital employee composition, authorization, memory, tool, and MCP seams instead of adding new runtime behavior.
- Cover the composition from template loading through an isolated task workflow.

**Non-Goals:**

- Add external MCP connectivity, real credentials, or a production project-management integration.
- Change generic employee capability authorization, memory policy, session schema, or model request semantics.
- Make the fixture a user-facing project management product or a configurable template generator.

## Decisions

### 1. Add a dedicated example package

Create a new package alongside `packages/examples/digital-employee-template` rather than expanding that fixture. The current example remains a minimal capability-free reference, while the new package has a single responsibility: proving the complete project-manager capability set.

Alternative considered: upgrade the existing example to declare every capability. Rejected because it would remove the small baseline fixture and obscure failures between minimal composition and capability wiring.

### 2. Use package-owned deterministic adapters

The package will declare project-planning skills, project-board and project-document tools, a mock MCP client, and seed-memory fixtures whose results are static. The normal template references and existing provider registrations remain the source of authority.

Alternative considered: mock capability results in only the test body. Rejected because it would not prove that template declarations resolve through the real employee composition.

### 3. Keep the employee instruction source in `AGENTS.md`

The coordinator instructions will live in the package-owned `AGENTS.md`, matching the established template vocabulary. It will define the project-manager role, required use of project data, reporting format, and prohibition on inventing unavailable capability results.

Alternative considered: introduce a parallel `agent.md` convention. Rejected because existing template loading and documentation already define `AGENTS.md` as the employee instruction source.

### 4. Verify behavior through an assembled, keyless workflow

Use an isolated DSH home, the existing mock model/replay harness, and the production employee start path. Assertions will inspect resolved capability authority, tool/MCP attribution, memory projection and promotion, and portable output.

Alternative considered: only unit-test the template object. Rejected because it cannot prove that the declared resources are mounted on the running employee Agent.

## Risks / Trade-offs

- [Fixture capabilities drift from runtime identifiers] → Template registration and assembled composition tests fail when any reference stops resolving.
- [Mock behavior becomes more elaborate than the product boundary] → Keep the project dataset, tools, and expected outputs intentionally small and static.
- [Memory assertions depend on model prose] → Assert durable memory identities and structured tool/MCP results instead of generated wording.
- [The example is mistaken for a production integration] → Document its test-only scope and package-owned mock behavior.

## Migration Plan

1. Add the example package, coordinator instructions, and fixture resources.
2. Mount its deterministic tool and MCP providers in the test composition.
3. Add package and assembled workflow tests.
4. Rollback removes the example package and test-only composition rows; no persisted user employee data requires migration.
