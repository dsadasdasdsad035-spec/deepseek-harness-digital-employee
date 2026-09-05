## Why

Workflows and subagents are host-configured code plugins only, so neither the marketplace nor digital employees can acquire orchestration assets. The hook package just established the pattern — a declarative kind on the shared marketplace machinery, an employee-scoped bridge, template references resolved at composition — and both new asset kinds fit it: workflows are scripts the existing engine already runs in worker threads, and subagents become declarative child personas executed by the fixed spawn-in-process provider.

## What Changes

- Add `workflow` and `subagent` as marketplace package kinds (fourth and fifth) on the shared trust/file-table/disclosure/managed-lifecycle machinery.
- A `workflow-package.json` descriptor declares workflow scripts (`entry` inside the signed file table, description, timeout) registered on `ctx.workflowEngine` when mounted.
- A `subagent-package.json` descriptor declares **declarative subagent personas** (instructions file inside the signed file table, tool allowlist, optional model settings, delegation policy) registered as `subagent__<id>` providers backed by the fixed spawn-in-process driver — a package never ships executable provider code.
- Employee templates and drafts gain `workflows: string[]` and `subagents: string[]` references; composition resolves them per instance and fails task start on unresolved references; mounted assets are instance-scoped like hook bindings.
- The configuration studio catalog joins installed workflow and subagent packages with bind/unbind; draft validation reports unresolved references.
- The Web market section gains Workflows and Subagents panels (upload, install, upgrade, uninstall, credential references where applicable).
- Chat: a `@employee` task composition mounts the bound workflows and subagents, so the employee's model can start workflows and delegate to its bound subagents.
- Ship signed publisher templates (`workflow-market-template.zip`, `subagent-market-template.zip`) for end-to-end verification.
- **BREAKING**: `MarketplacePackageKind` widens again (single repo, pre-release stance).

## Capabilities

### New Capabilities

- `workflow-marketplace`: acquisition, trust, lifecycle, and inventory of workflow packages; registration on the workflow engine when mounted.
- `subagent-marketplace`: acquisition, trust, lifecycle, and inventory of declarative subagent packages; registration of `subagent__<id>` providers backed by the in-process spawn driver.
- `employee-asset-bridge`: instance-scoped mounting of bound workflow and subagent packages onto an employee composition, including the chat-invocation paths.

### Modified Capabilities

- `digital-employee-templates`: templates gain `workflows` and `subagents` references resolved per instance at composition.
- `digital-employee-configuration-studio`: catalog and draft binding cover workflow and subagent packages.

## Impact

- `packages/util/marketplace-core` — kind widening, two descriptor schemas + parsers, CLI/builder, templates.
- `packages/workflow/workflow-market` and `packages/subagent/subagent-market` — new market+bridge plugins mirroring `hooks-market`.
- `packages/client/ui-skill-market` — two market panels; `packages/client/ui-digital-employees` — two capability kinds in the studio selectors.
- `packages/host/digital-employee-management`, `packages/core/digital-employee-agent`, `packages/core/digital-employee-file` — reference threading and composition resolution.
- `packages/api/remotes` — remote namespaces and type re-exports; docs, catalogs, Agent Note.
