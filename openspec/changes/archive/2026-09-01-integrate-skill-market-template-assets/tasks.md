## 1. Client-Safe Catalog Contract

- [x] 1.1 Add failing Host tests for active marketplace skills, inactive marketplace-only skills, active local skills, deterministic deduplication, and client-safe metadata.
- [x] 1.2 Extend the digital employee configuration asset types with optional marketplace tags and managed-source metadata, then update generated Remote client declarations.
- [x] 1.3 Update package JSDoc and README documentation for the merged skill catalog and its availability semantics.

## 2. Host Catalog Merge

- [x] 2.1 Implement Gateway retrieval of the runtime skill registry and optional skill marketplace inventory without exposing Host paths or archive filenames.
- [x] 2.2 Merge both inventories by stable skill name, using runtime registration for availability and marketplace inventory for version, author, tags, source, and restart guidance.
- [x] 2.3 Keep runtime-only local skills selectable and marketplace-only installed skills visible but unavailable.
- [x] 2.4 Verify validation still rejects selected skill names that are absent from the runtime registry.

## 3. Template Configuration UI

- [x] 3.1 Add failing client component tests for marketplace metadata, disabled inactive skills, selectable local skills, and removable stale selections.
- [x] 3.2 Render skill version, author, tags, marketplace/local source, and restart diagnostics in the template capability selector.
- [x] 3.3 Prevent new unavailable skill selections while preserving an unavailable selected row that can be deselected.
- [x] 3.4 Keep saved draft authorities limited to stable skill names and retain publication pre-validation behavior.

## 4. Assembled Workflow Coverage

- [x] 4.1 Extend the Web E2E fixture to install a valid marketplace skill through the real marketplace path and activate it in the runtime registry.
- [x] 4.2 Prove the activated marketplace skill appears with metadata in Template configuration and can be selected and saved.
- [x] 4.3 Prove an installed but inactive marketplace skill is displayed as unavailable and cannot be newly selected.
- [x] 4.4 Add or update the keyless runnable snapshot for the product-visible merged catalog behavior.

## 5. Documentation And Verification

- [x] 5.1 Add the required Agent Note describing runtime availability versus marketplace provenance and update affected bilingual documentation.
- [x] 5.2 Run focused Host, client, marketplace, and Web E2E tests plus the affected TypeScript checks.
- [x] 5.3 Run `pnpm run doc-sync`, staged lint, and OpenSpec strict validation for the completed change.
