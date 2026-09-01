## 1. Package and Typed API Foundation

- [x] 1.1 Reconcile the exploratory `packages/skill/skill-market` package with the design: remove the independent `/skill-market` channel and message-parsing protocol, define the Host transaction-engine and Typert Remote module structure, and update package exports, dependencies, TypeScript references, build configuration, and invariant companion.
- [x] 1.2 Define client-safe branded identifiers, inventory entries, install/banner/uninstall requests, success values, and the closed structured business-error union in the package `./types` face, including strict wire schemas and exhaustive discriminant handling.
- [x] 1.3 Generate and check in the `skillMarket` Typert Host and Remote client artifacts, then add generation coverage that rejects drift in the public namespace.
- [x] 1.4 Add a typed filesystem-provider Host-mutation notification that delegates to its existing registration-owned invalidation path, with focused tests proving relevant committed paths invalidate discovery and unrelated paths do not.

## 2. Hostile Archive Validation

- [x] 2.1 Add reusable ZIP fixtures and failing tests for strict base64 decoding, malformed ZIP input, the 10 MiB decoded archive cap, 256-file cap, 30 MiB per-entry cap, 30 MiB total extracted cap, early stream termination, and staging cleanup.
- [x] 2.2 Implement bounded streaming ZIP inventory and extraction with `fflate`, counting declared and observed sizes before publication and containing decoder termination and cleanup failures.
- [x] 2.3 Add failing tests and implement normalized entry validation for absolute, drive, UNC, backslash, NUL, dot-segment, traversal, duplicate, symbolic-link, non-regular, multi-root, and mixed-layout archives, while accepting direct-root and one-enclosing-directory bundles.
- [x] 2.4 Add failing tests and implement strict root `SKILL.md` parsing by reusing the owning skill schema where available, plus bounded `metadata.marketplace` validation for version, author, tags, banner, and unknown keys.
- [x] 2.5 Add failing tests and implement PNG, JPEG, WebP, and GIF banner path, regular-file, 2 MiB size, extension, and magic-byte validation, including revalidation when banner bytes are read after installation.

## 3. Manifest and Filesystem Transactions

- [x] 3.1 Define strict `.dsh-market.json` schema version 1 persistence and readers, then test deterministic managed inventory, missing roots, malformed or incompatible manifests, mismatched names, externally changed banners, and omission of absolute Host paths.
- [x] 3.2 Implement an in-process keyed mutex with waiter cleanup and tests proving same-name install, upgrade, and uninstall serialize while different skill names can progress independently.
- [x] 3.3 Add failing lifecycle tests and implement new installation through a private same-filesystem sibling staging directory, complete staged verification, manifest write, atomic target rename, and contained cleanup.
- [x] 3.4 Add failing lifecycle tests and implement explicit managed upgrade with final locked ownership checks, backup rename, atomic publication, rollback restoration, and refusal to replace unmanaged, incompatible, or mismatched targets even with replacement intent.
- [x] 3.5 Add failing lifecycle tests and implement managed-only uninstall through a same-filesystem tombstone rename followed by contained recursive cleanup, including absent, unmanaged, incompatible, and mismatched target outcomes.

## 4. Host Remote and Composition Tests

- [x] 4.1 Implement the `skillMarket` Typert Remote gateway methods, mapping only declared domain failures to structured outcomes and leaving cancellation, transport, and unexpected failures to the Remote carrier.
- [x] 4.2 Trigger the typed filesystem-provider mutation notification only after successful install, upgrade, or uninstall detachment, and test that failed validation, failed commits, and restored rollbacks do not announce a successful candidate.
- [x] 4.3 Mount the generated marketplace Remote contribution in `packages/api/remotes`, update its client-safe type re-exports and package dependencies, and update API gateway generation or assembly expectations.
- [x] 4.4 Add a real Loader-composed Host test using an isolated DSH home and `cordis.yml` that mounts the Typert registry, API carrier, skill registry, filesystem provider, and marketplace; invoke the generated Remote and prove install, discovery refresh, managed upgrade, banner read, and uninstall.

## 5. Web Marketplace Feature

- [x] 5.1 Rework the `packages/client/ui-skill-market` store to call `ctx.remote.skillMarket`, consume shared generated types, perform `.zip` and 10 MiB client preflight, and map structured Host codes to localized user outcomes without parsing messages.
- [x] 5.2 Implement cancellable inventory and banner loads with generation guards, prompt release of encoded archive and image data, managed-upgrade-only confirmation, confirmed uninstall, retry, progress, success, and failure state transitions.
- [x] 5.3 Implement the localized settings navigation and section slot contributions with CSS Modules and repository tokens, including stable responsive cards, metadata, search, image placeholders, icon controls, accessible status/alert semantics, and keyboard-operable upload and confirmation flows.
- [x] 5.4 Add focused store, locale, slot, component, interaction, stale-response, cancellation, error-mapping, and responsive-layout tests for every Web scenario in `skill-market-web`.

## 6. Shipped Web Assembly and Browser Coverage

- [x] 6.1 Replace exploratory marketplace entries in `packages/bundle/web-app` with the Host Typert Remote and client slot composition, then update bundle manifests, resolver dependencies, app dependencies, aggregate TypeScript references, invariants, and composition tests.
- [x] 6.2 Add a keyless `apps/web` browser test with an isolated DSH home that boots the shipped composition and exercises localized navigation, empty state, ZIP upload through real `/api`, promotional image rendering, search, managed upgrade confirmation, unmanaged-conflict refusal, and confirmed uninstall.
- [x] 6.3 Add or update the narrow accessible-output fixture owned by the marketplace browser test and verify it is portable across macOS and Linux without path or timing normalization.

## 7. Documentation and Verification

- [x] 7.1 Update Host and Web README files and exported JSDoc together to document bundle layout, marketplace metadata, fixed limits, supported images, structured outcomes, manifest ownership, atomic lifecycle, discovery timing, Web states, and explicit non-goals in both maintained languages.
- [x] 7.2 Add the required Agent Note covering the Typert Remote choice, manifest authority, keyed transaction lifecycle, filesystem-provider invalidation, security limits, browser workflow, deferred crash-residue recovery, and absence of session, model, or SDK changes.
- [x] 7.3 Run the focused Host, filesystem-provider, API Remote assembly, client store/component, Web bundle, real Loader, and assembled browser tests; fix every observed failure without weakening hostile-input assertions.
- [x] 7.4 Run the relevant generated-artifact checks, `pnpm run typecheck`, `pnpm run build`, `pnpm run hygiene`, `pnpm run doc-sync`, `pnpm run test:web:built`, `openspec validate add-skill-marketplace --strict`, and `git diff --check`, recording only commands actually executed.
