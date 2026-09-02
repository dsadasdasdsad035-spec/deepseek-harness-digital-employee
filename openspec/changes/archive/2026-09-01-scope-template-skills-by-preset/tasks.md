## 1. Preset-Aware Remote Contract

- [x] 1.1 Add failing Host tests that request configuration assets for two presets with different scoped Skill catalogs and prove there is no Host-global fallback.
- [x] 1.2 Extend the configuration asset request with the selected preset identity and define client-safe failures for unknown, broken, and unmountable presets.
- [x] 1.3 Regenerate the digital employee management Remote declarations and update API Remote contract tests.
- [x] 1.4 Document the preset-aware asset request and failure semantics in package JSDoc and bilingual READMEs.

## 2. Host Preset-Scoped Skill Resolution

- [x] 2.1 Inject the Agent preset service into digital employee management and resolve the requested preset through its standing scope.
- [x] 2.2 Query the Skill registry with the preset standing scope and merge those summaries with marketplace installations by stable Skill name.
- [x] 2.3 Preserve marketplace metadata while deriving selectability exclusively from the selected preset's scoped runtime catalog.
- [x] 2.4 Return explicit preset diagnostics without exposing preset paths, Skill paths, archive filenames, or credentials.
- [x] 2.5 Reuse the same preset-scoped Skill resolution during draft validation and publication so browser state cannot authorize an unavailable Skill.
- [x] 2.6 Add lifecycle tests proving catalog preview creates no Agent, Session, turn, or model request and shares one standing preset composition across concurrent reads.

## 3. Template Configuration Client

- [x] 3.1 Add failing store tests for loading assets by draft preset, switching presets, out-of-order responses, and preset-resolution failures.
- [x] 3.2 Load configuration assets for the draft currently being edited and refresh them whenever its preset changes.
- [x] 3.3 Add a bounded Skill loading state and generation guard so stale preset responses cannot replace the latest catalog.
- [x] 3.4 Disable new Skill selection after a failed preset refresh while retaining the last catalog only as non-authoritative display data.
- [x] 3.5 Preserve selected Skills that become unavailable after a preset change as diagnostic rows that remain removable.
- [x] 3.6 Add component tests for marketplace-managed and local Skills becoming selectable or unavailable as the preset changes.

## 4. Assembled Runtime Coverage

- [x] 4.1 Replace the Web E2E fixture's manual `ctx.skills.register()` activation with a real Skill marketplace ZIP installation into an isolated Harness home.
- [x] 4.2 Mount an actual preset with filesystem Skill discovery and prove the installed marketplace Skill becomes selectable in Template configuration.
- [x] 4.3 Switch to a preset that does not expose the installed Skill and prove the Skill becomes unavailable, remains removable when selected, and blocks publication while retained.
- [x] 4.4 Prove opening and refreshing Template configuration does not create a Session, Agent, conversation, or model request.
- [x] 4.5 Update the keyless runnable snapshot to show preset-scoped marketplace Skill availability and the preset mismatch diagnostic.

## 5. Documentation And Verification

- [x] 5.1 Add an Agent Note describing why preset standing scope, rather than Host-global Skill discovery, owns template availability.
- [x] 5.2 Update affected bilingual digital employee, Agent preset, Skill registry, and marketplace documentation.
- [x] 5.3 Run focused Agent preset, Skill registry, Host Gateway, client store, component, snapshot, and Web E2E tests.
- [x] 5.4 Run affected Host and Client TypeScript builds, staged lint, `pnpm run doc-sync`, and strict OpenSpec validation.
