## 1. Skill Runtime Composition

- [x] 1.1 Add failing digital-employee Agent tests proving that an authorized Skill loses its catalog and loader when the business Tool allowlist excludes `skill`.
- [x] 1.2 Compose the existing model-facing Skill consumer in the exact employee Agent scope for Skill-enabled employees, with effect-owned teardown and deterministic duplicate handling.
- [x] 1.3 Keep the Skill allowlist authoritative while verifying that undeclared Skills remain absent and the business Tool schema remains restricted.
- [x] 1.4 Update package dependencies, exports, JSDoc, and package documentation for the employee-owned Skill invocation lifecycle.

## 2. Effective Template Validation

- [x] 2.1 Add validation tests for a draft whose preset exposes Skill definitions but whose resulting Agent cannot publish or load them.
- [x] 2.2 Extend configuration validation and preview composition to verify authorized Skill resolution, model-facing catalog visibility, and loader availability through the production composition path.
- [x] 2.3 Return actionable diagnostics for missing preset Skills, unavailable Skill invocation infrastructure, and authorization mismatches without storing `skill` in template Tool grants.

## 3. Mention-Started Memory Retrieval

- [x] 3.1 Add Host gateway tests proving that mention-started tasks derive an employee-owned long-term memory request from accepted initial task text.
- [x] 3.2 Add validated Host configuration for the bounded automatic memory result limit and pass the derived request to digital employee task creation.
- [x] 3.3 Cover empty retrieval text, no matching records, explicit internal requests, employee isolation, and durable memory-projection events.
- [x] 3.4 Update Host API and digital employee memory documentation to describe automatic retrieval at ordinary task startup.

## 4. Project Manager Behavioral Fixture

- [x] 4.1 Update the `project-manager-test` composition so its authorized Skills use the employee-owned invocation infrastructure without adding `skill` to business Tool grants.
- [x] 4.2 Extend the deterministic mock model to observe `<available_skills>`, invoke an authorized project-management Skill, and consume its returned package instructions.
- [x] 4.3 Route the assembled fixture through ordinary task-start memory behavior and assert Skill selection attribution, loaded Skill content, business Tool/MCP activity, and Atlas memory projection.
- [x] 4.4 Refresh the portable keyless transcript and add negative assertions for undeclared Skills and business Tools.

## 5. Web And Regression Coverage

- [x] 5.1 Add or update Web E2E coverage that submits a project-manager employee through the `@` composer and reaches the employee-owned Session successfully.
- [x] 5.2 Run focused digital employee Agent, management Host, Skill consumer, configuration studio, project-manager package, snapshot, and Web E2E tests.
- [x] 5.3 Run the affected package typecheck/build and repository gates selected by `dsh-pre-push-checks`.
- [x] 5.4 Add the required Agent Note and update affected architecture/testing documentation with the final ownership and acceptance-test decisions.
