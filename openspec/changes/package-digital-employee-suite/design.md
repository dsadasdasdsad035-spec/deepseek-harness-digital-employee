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

The suite bundle owns every marketplace, digital employee, and company Host row and its browser rows; the Web bundle keeps the shared `api-remotes` carrier and the generic browser surface, and documents that the suite's generated Typert Host methods travel over it. Neither bundle duplicates the other's loader IDs, so loading both cannot register a second `skillMarket`, `toolMarket`, `mcpMarket`, company, or digital employee namespace. Composition tests assert the exact row split across both patches.

### Keep marketplace and company support in the one suite

The distributable package includes the marketplace and company Host and client contributions — the marketplaces provision employees and companies bind them — because Template configuration depends on their catalogs. One installable package is the single entry for all three domains; splitting it further waits for a stable extension contract.

### Stack the suite in the shipped web profile template

`PROFILE_TEMPLATES.web` composes `[dsh-base, dsh-web-app, dsh-digital-employee-suite]`, so the shipped surface keeps every capability after the row split, and `dsh plugin --profile <name> add @deepseek-ai/dsh-digital-employee-suite` is the out-of-tree entry for everyone else. The pre-split `[dsh-base, dsh-web-app]` tuple is registered as installation-owned, so an existing web profile normalizes to the new template on its next load; any customized list stays user-owned.

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
2. Move the marketplace, digital employee, and company rows and dependencies from `dsh-web-app` into the suite; the Web bundle keeps the shared carrier.
3. Stack the suite in `PROFILE_TEMPLATES.web` and register the pre-split web tuple as installation-owned so existing profiles normalize on next load.
4. Update the assembled composition harnesses to the three-layer stack and run the cross-project smoke test against it.
5. Release the bundle without changing existing user-home files.
6. To roll back, remove the bundle from the profile and restart; preserved user data becomes visible again when a compatible bundle is installed.
