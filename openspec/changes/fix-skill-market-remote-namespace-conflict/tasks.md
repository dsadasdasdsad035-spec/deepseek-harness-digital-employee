## 1. Reproduce The Composition Failure

- [x] 1.1 Add a focused regression test that loads the real Web Host API gateway, API Remote bundle, and skill marketplace composition and observes successful plugin application
- [x] 1.2 Assert the assembled client exposes `skillMarket.banner`, `skillMarket.install`, `skillMarket.list`, and `skillMarket.uninstall` through the shared API carrier

## 2. Correct Remote Registration

- [x] 2.1 Rename the client namespace's internal `install` helper so generated `install` operations mount without weakening collision checks
- [x] 2.2 Confirm and update API Remote package exports, dependencies, and TypeScript references required by the marketplace contribution
- [x] 2.3 Regenerate or verify the skill marketplace Typert Host and Remote client artifacts from source

## 3. Integration Verification

- [x] 3.1 Run the focused API gateway, skill marketplace gateway, Loader composition, and generation-drift tests
- [x] 3.2 Run the affected client and Web typechecks plus the built Web smoke test
- [x] 3.3 Start `pnpm dsh web` with Node 22 and verify the Host loads plugins without the `skillMarket/install` namespace conflict
- [x] 3.4 Run `openspec validate fix-skill-market-remote-namespace-conflict --strict` and `git diff --check`
