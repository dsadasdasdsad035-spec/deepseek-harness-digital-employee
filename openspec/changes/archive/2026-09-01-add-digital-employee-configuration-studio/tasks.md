## 1. Studio Domain And Persistence

- [x] 1.1 Define typed draft, validation-result, preview, publication-provenance, and local-version records with client-safe request and response types.
- [x] 1.2 Add a durable local configuration-studio provider with atomic draft revision and publication-version allocation.
- [x] 1.3 Add validated local-administrator configuration and enforce it for every configuration-studio Host operation.

## 2. Template And Capability Composition

- [x] 2.1 Extend template resolution to list and resolve locally published immutable versions alongside plugin-contributed versions.
- [x] 2.2 Implement draft validation for metadata, instructions, resolvable Skills/Tools/MCP clients, credential references, MCP server-name uniqueness, expert containment, and delegation limits.
- [x] 2.3 Implement atomic publication that revalidates the current draft revision, writes provenance, and materializes an immutable resolvable template version.
- [x] 2.4 Implement temporary preview composition with isolated session and memory ownership plus deterministic teardown.

## 3. Host And Remote API

- [x] 3.1 Expose typed configuration-studio list, draft mutation, validation, preview, publication, and version-history operations through the management Host.
- [x] 3.2 Register remote API contributions without naming conflicts and limit configuration-studio methods to local administrators.
- [x] 3.3 Keep published versions selectable by existing employee creation and explicit upgrade comparison flows.

## 4. Web Configuration Studio

- [x] 4.1 Add administrator-only navigation and routing that separates the configuration studio from employee instance operations.
- [x] 4.2 Build draft list, draft editor, validation diagnostics, preview controls, version history, and publish confirmation views using existing UI patterns.
- [x] 4.3 Render capability, expert, memory, and MCP references without rendering credential values, and provide actionable validation states.
- [x] 4.4 Preserve the existing ordinary-user employee workspace when the configuration studio is unavailable.

## 5. Verification And Documentation

- [x] 5.1 Add focused provider and Host tests for draft persistence, authorization, validation failures, immutable publication, preview isolation, and template resolution.
- [x] 5.2 Add Web store and composition tests for administrator visibility, draft workflow, diagnostics, preview, and publishing.
- [x] 5.3 Add a real runnable keyless snapshot covering draft creation, validation, preview, publication, employee creation, and explicit upgrade review.
- [x] 5.4 Update package documentation, generated catalogs as required, translations, and an Agent Note covering the configuration-studio architecture.
- [x] 5.5 Run the targeted checks selected by the repository pre-push guidance and record their results.
