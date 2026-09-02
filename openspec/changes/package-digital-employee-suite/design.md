## Context

The current Web bundle already assembles the digital employee Host, client UI, remote API, persistence, and Skill/Tool/MCP marketplace plugins. The intended reusable unit is therefore a loader bundle over existing capability seams, not a second agent runtime. User data is resolved through the target Harness home and is independent from npm package contents.

## Goals / Non-Goals

**Goals:**

- Publish one `digital-employee-suite` bundle that can be added to another Harness profile.
- Make loader ordering, package dependencies, and remote namespace ownership explicit.
- Keep employee records, configuration-studio files, template instruction files, marketplace installations, and credential references target-local.
- Preserve existing Web behavior and provide an isolated cross-project smoke test.

**Non-Goals:**

- Redesign digital employee runtime, memory, expert delegation, or marketplace archive validation.
- Ship a hosted marketplace, account synchronization, or cross-machine credential migration.
- Automatically copy the author’s templates or installed packages into a consuming project.

## Decisions

### Use a dedicated bundle over existing plugins

Create a new bundle package with a `cordis.patch.yml` that references the existing Host and client packages. This preserves capability ownership and lets each package retain its tests and lifecycle. Copying source files into one monolithic plugin would duplicate registrations and make upgrades unsafe.

### Define one remote composition owner

The suite bundle SHALL either own the `api-remotes` contribution or document that it is supplied by the base Web bundle. The package MUST NOT add a second `skillMarket`, `toolMarket`, `mcpMarket`, or digital employee remote namespace when the consuming profile already loads one. Composition tests will assert unique loader IDs and remote method namespaces.

### Keep marketplace support in the first suite

The first distributable package will include the marketplace Host and client contributions because Template configuration depends on their catalogs. The bundle may later be split into core and marketplace packages after a stable extension contract exists.

### Resolve all durable paths from the target Harness home

Bundle config will use `dshHomePath(...)` for employee persistence, configuration-studio storage, template resources, Skills, Tools, and MCP packages. No absolute development path or resolved credential value is allowed in package files.

### Test through a temporary profile

The cross-project test will create a temporary profile and Harness home, install or link the bundle through the normal profile composition, boot the assembled Host, and inspect client contributions and remote behavior. It will assert that the real developer home is not read.

## Risks / Trade-offs

- [Duplicate Web composition] → Define supported profile recipes and add a loader/remote uniqueness test; fail loudly on duplicate ownership.
- [Existing templates reference unavailable capabilities] → Revalidate templates on startup and surface actionable diagnostics without deleting user data.
- [Bundle package drift from Web bundle] → Keep the bundle’s dependency list and patch entries covered by composition tests and package build checks.
- [Credential references do not resolve in a new project] → Import only references, require target-local credential setup, and never copy secret values.
- [Removing the bundle hides data from the UI] → Treat all durable files as user-owned and preserve them during bundle removal.

## Migration Plan

1. Add and build the bundle alongside the existing Web bundle.
2. Install it in an isolated profile and run the cross-project smoke test.
3. Document the supported profile composition, including how to avoid loading duplicate digital employee or marketplace entries.
4. Release the bundle without changing existing user-home files.
5. To roll back, remove the bundle from the profile and restart; preserved user data becomes visible again when a compatible bundle is installed.
