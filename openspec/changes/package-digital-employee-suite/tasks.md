## 1. Bundle Foundation

- [x] 1.1 Create `packages/bundle/digital-employee-suite` with package metadata, build configuration, exports, and bundle patch declaration.
- [x] 1.2 Declare the complete Host, Client, API, persistence, preset, and marketplace dependencies required by the suite.
- [x] 1.3 Add a profile composition that loads the suite without duplicate digital employee, marketplace, or remote namespace entries.
- [x] 1.4 Configure all durable paths with target Harness-home expressions and verify no source-machine path or credential value is packaged.

## 2. Composition Integration

- [x] 2.1 Define ownership for the shared `api-remotes` contribution and update Web bundle composition so loading both bundles cannot register duplicate namespaces.
- [x] 2.2 Ensure the suite mounts the digital employee workspace, Template configuration, Skill/Tool/MCP market UI, and `@数字员工` input source.
- [x] 2.3 Ensure Template configuration receives target-local employee, template, Skill, Tool, and MCP stores after a fresh Host boot.
- [x] 2.4 Document supported profile recipes for installing the suite alone or alongside the Web bundle.

## 3. Lifecycle And Data Safety

- [x] 3.1 Preserve target user data when the suite is upgraded or removed, and validate retained references on the next boot.
- [x] 3.2 Add import or fixture setup for a clean target Harness home without copying the developer’s real home.
- [x] 3.3 Verify MCP credential references remain reference-only throughout bundle configuration and template publication.

## 4. Verification

- [x] 4.1 Add bundle manifest and loader-composition tests for dependency presence, ordering, and duplicate namespace rejection.
- [x] 4.2 Add an isolated Host test that creates a draft, publishes a template, and lists target-local marketplace assets.
- [x] 4.3 Add Web E2E coverage for Digital employees, Template configuration, Skill/Tool/MCP market navigation, and `@数字员工`.
- [x] 4.4 Add a keyless assembled snapshot or update the applicable snapshot harness for the new product-visible composition.
- [x] 4.5 Run focused tests, typecheck, build, and the repository pre-push checks; record any environment-blocked checks.
