## 1. marketplace-core: workflow and subagent kinds

- [ ] 1.1 Widen `MarketplacePackageKind` and managed-manifest kind to include `'workflow'` and `'subagent'`; descriptor filename map (`workflow-package.json`, `subagent-package.json`); CLI `--kind`
- [ ] 1.2 `workflow-package.json` schema + parser: entries `{ id, entry, description, timeoutSec? }`, entry pinned to the signed file table, implied `subprocess` permission
- [ ] 1.3 `subagent-package.json` schema + parser: entries `{ id, instructions, tools?, modelSettings?, delegation? }`, instructions pinned to the file table, blank/absent instructions rejected, provider-code shapes rejected, implied `subprocess` permission
- [ ] 1.4 CLI/builder support and signed publisher templates (`workflow-market-template.zip`, `subagent-market-template.zip`)
- [ ] 1.5 Unit tests: descriptor validation (blank instructions, provider-code shapes, interpreter rules, file-table pinning), builder round-trip, managed lifecycle for both kinds

## 2. Market plugins and web client

- [ ] 2.1 `packages/workflow/workflow-market`: service/gateway/Remote (install, upgrade, uninstall, list, configure) mirroring `hooks-market`, wired into the web bundle and `api-remotes`
- [ ] 2.2 `packages/subagent/subagent-market`: same trio for subagent packages
- [ ] 2.3 Web client: Workflows and Subagents panels in the market section (upload, install, upgrade, uninstall, credential references), bilingual locale keys
- [ ] 2.4 Tests: market service lifecycle for both kinds; client store/panel tests

## 3. Bridges

- [ ] 3.1 Workflow bridge: `mountEmployeeAssets` registers bound entries on `ctx.workflowEngine` with the package script root; unmount disposes registrations
- [ ] 3.2 Subagent bridge: registers `subagent__<id>` providers delegating to the in-process spawn driver with persona instructions, tool filter, model settings, and enforced delegation policy
- [ ] 3.3 Tests: registration visibility (bound employee only), unmount reversibility, workflow start, persona delegation, policy enforcement

## 4. Digital employee templates, studio, composition

- [ ] 4.1 Template/draft schema gains `workflows` and `subagents` reference lists; schema sanitizer and file provider project them into the resolved employee (the hook gap)
- [ ] 4.2 Composition resolves references against installed packages before task start; unresolved references fail with named diagnostics; mounting precedes the tool restriction layer
- [ ] 4.3 Studio: catalog entries for both kinds, `CapabilitySelectors` groups, bind/unbind, draft validation diagnostics
- [ ] 4.4 Tests: template registration with references, per-instance scoping, resolution failure, studio validation and bind/unbind

## 5. Snapshot, docs, notes

- [ ] 5.1 Keyless assembled snapshot: install both template packages, bind on a template, `@employee` chat turn starting the workflow and delegating to the persona; dual expected transcripts updated in the same change
- [ ] 5.2 Bilingual docs: market READMEs, subsystem/catalog updates, `SERVICE_PAGE` and type-link classifications, doc graphs
- [ ] 5.3 Bilingual implementation Agent Note recording the declarative-persona decision and instance scoping
