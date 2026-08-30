## Context

See `proposal.md` for motivation. The skill marketplace Host exposes four direct Typert Remote methods under the `skillMarket` namespace, and `@deepseek-ai/dsh-api-remotes` mounts generated client contributions into the shared API client. The assembled Web Host currently fails during plugin application because `RemoteNamespaceService` uses `install` as an internal helper name and rejects a generated operation with that same ordinary business name.

The public namespace and the shared `/api` carrier are already consumed by the marketplace UI. Generated Typert files are artifact-plane outputs and must remain derived from source declarations.

## Goals / Non-Goals

**Goals:**

- Allow generated operations to use `install` without colliding with namespace bookkeeping.
- Preserve `ctx.remote.skillMarket` and the four existing operation names.
- Detect the reported failure through real Loader composition.
- Keep generated Host and Remote artifacts synchronized with source.

**Non-Goals:**

- Introduce a separate marketplace HTTP route or transport.
- Rename marketplace operations or change their request and result fields.
- Add compatibility handling for the conflicting registration.
- Change marketplace archive validation or filesystem lifecycle behavior.

## Decisions

### Rename the namespace service's internal installation helper

The client gateway will rename its private `install` helper to a bookkeeping-specific name. The public namespace remains a traced Cordis service, and its generated `install` property can then be installed using the existing dynamic method mechanism.

This preserves generated typing, endpoint metadata, and existing service tracing while removing an accidental reservation. Renaming the marketplace operation was rejected because `install` is the intended public API. Disabling collision checks was rejected because actual namespace implementation members must still fail loudly instead of being shadowed.

### Keep Host implementation ownership in the marketplace package

The marketplace package will continue to own the Host gateway and domain service. Client bundle code will only mount generated Remote metadata and re-export client-safe types where needed.

This keeps capability implementation separate from application assembly. Moving marketplace logic into the API bundle was rejected because it would couple a reusable Host capability to one application composition.

### Prove startup and invocation through assembled Loader coverage

A regression test will load the production-relevant Web plugin composition with an isolated user home, assert that plugin application succeeds, and resolve the marketplace namespace from the assembled client API. Existing focused gateway tests remain responsible for request and result behavior.

A unit test that only inspects generated maps was rejected because the observed failure occurs when Cordis applies multiple plugins and claims service properties.

### Regenerate artifacts from corrected source declarations

Typert Host and Remote client outputs will be regenerated after source changes, and generation drift checks will verify them. Generated files will not be edited as the source of the fix.

## Risks / Trade-offs

- [Risk] Renaming the helper could miss internal call sites or weaken cleanup. -> Mitigation: retain the existing mount, invocation, and disposal tests and add an `install` endpoint regression.
- [Risk] A Loader test may accidentally use source-only resolution unlike the shipped Web application. -> Mitigation: retain built-Web smoke coverage alongside the focused composition regression.
- [Risk] Concurrent marketplace implementation work may move package entry points. -> Mitigation: derive imports from package exports and regenerate artifacts after integration.

## Migration Plan

1. Rename the client namespace bookkeeping helper and add the regression.
2. Confirm the existing API Remote package wiring and regenerate Typert outputs if source metadata changed.
3. Run focused gateway and Loader composition tests, then the built Web smoke.
4. Restart `pnpm dsh web` and confirm the Host applies all plugins.

Rollback consists of reverting the source composition and regenerated outputs together; there is no persisted-data migration.
