## 1. Trace And Define Runtime Behavior

- [ ] 1.1 Capture the current `@` digital employee startup payload and first model request in the Web/Host test harness.
- [x] 1.2 Add focused assertions for the employee-scoped skill catalog, including marketplace and local skills and the exact `skill({ name })` schema.

## 2. Fix Employee Skill Composition

- [x] 2.1 Ensure the selected preset is mounted and employee skill restrictions are applied before the model-facing skill catalog is published.
- [x] 2.2 Ensure the catalog and loader use the same employee Agent scope and current snapshot, with no unscoped fallback.
- [x] 2.3 Preserve catalog refresh behavior for resumed or recomposed employee Sessions and return a clear diagnostic for stale, unauthorized, or pseudo-name requests such as `list`.

## 3. Add Regression Coverage

- [ ] 3.1 Extend the keyless digital employee fixture with an authorized exact-name skill load and an invalid `list` loader call.
- [ ] 3.2 Add or update the assembled snapshot/transcript to prove catalog visibility, skill instruction loading, rejection behavior, and employee attribution.
- [ ] 3.3 Add Web E2E coverage that starts a digital employee with `@`, observes its first request, and verifies the configured skill is available and loadable.

## 4. Documentation And Verification

- [x] 4.1 Update affected skill/runtime documentation and add the required Agent Note for the catalog-loading invariant.
- [ ] 4.2 Run focused package tests, fixture/snapshot checks, typecheck, and relevant Web E2E checks.
- [x] 4.3 Run OpenSpec validation and review the final diff for stale assumptions or unintended Host-global capability exposure.
