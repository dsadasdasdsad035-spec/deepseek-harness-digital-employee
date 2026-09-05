## Context

This is the third pass over the same seam. The hook kind (`marketplace-employee-hooks`, implemented) established: declarative kinds widen `MarketplacePackageKind` in marketplace-core; a market+bridge plugin owns install and employee-scoped mounting; template references resolve at composition; the studio catalog joins assets; the assembled keyless snapshot covers install → bind → chat. The workflow subsystem already runs scripts on `ctx.workflowEngine` in worker threads, and the subagent registry already accepts multiple named providers with persona/tool-filter capabilities and an in-process spawn driver — both are consumption-ready; neither needs protocol changes.

## Goals / Non-Goals

**Goals:**
- Two declarative package kinds (`workflow`, `subagent`) on the shared trust machinery, with a single implementation pass since they are mechanically identical up to the descriptor and the bridge target.
- Template references (`workflows`, `subagents`) resolved per instance at composition, instance-scoped mounting, studio binding, chat invocation — the hooks template applied twice.
- Signed publisher templates for both kinds and one assembled keyless snapshot covering install → bind → chat for each.

**Non-Goals:**
- Executable subagent provider code in packages (personas run on the fixed in-process spawn driver; the Codex/CC/ACP/SDK providers remain host-configured plugins).
- Marketplace distribution of the fixed Ralph workflow or engine itself.
- Cross-employee or global asset mounting.
- New credential mechanics (env slots reuse the existing reference pattern only where an asset needs one).

## Decisions

**D1: One descriptor shape per kind, both validated by the shared parser path.** `workflow-package.json` entries: `{ id, entry, description, timeoutSec? }` with `entry` a slash-containing file-table member (same pinning rule as hook args). `subagent-package.json` entries: `{ id, instructions, tools?, modelSettings?, delegation? }` where `instructions` is a file-table member; the parser rejects entries whose instructions are blank or absent from the file table and rejects any field shaped like provider code (no `command`, no `entry` script). Rationale: both kinds are data; the executable-code risk lives in the workflow script and the persona's *effect*, both covered by trust + disclosure + file table.

**D2: One market+bridge plugin per subsystem, mirroring `hooks-market`.** `packages/workflow/workflow-market` and `packages/subagent/subagent-market`, each with the service/gateway/Remote trio from `hooks-market` plus a `mountEmployeeAssets(agentCtx, bindings)` export. The workflow bridge registers entries on `ctx.workflowEngine` with the package directory as script root; the subagent bridge registers `subagent__<id>` providers that delegate to the in-process spawn driver with the persona's instructions, tool filter, and policy. Duplicating the two small services beats inventing a generic multi-kind market abstraction — the repo already chose per-subsystem market services (tool/mcp/hooks) and this keeps the seam consistent.

**D3: Composition order and authority.** As hooks taught, asset mounting must precede `tools.restrict` and the returned model-facing names join the authority allowlist: workflow entries surface through the existing workflow tool (started by id) so no new tool names; subagent personas surface as `subagent__<id>` provider names, and the employee's delegation authority gains them — the provider-name uniqueness registry already rejects cross-instance duplicates, so bridge registration failure is loud, not silent.

**D4: Studio and templates are mechanical.** `DigitalEmployeeTemplate`/draft gain `workflows?: string[]`, `subagents?: string[]`; the file provider projects them into the resolved employee (the hooks gap — the schema sanitizer strips unknown fields, so both schema and provider must pass them through, as the hook fix did); `CapabilitySelectors` gains the two kinds; validation reports `unavailable-workflow` / `unavailable-subagent`.

**D5: Templates and fixtures carry the acceptance.** `workflow-market-template.zip` ships a no-op script; `subagent-market-template.zip` ships a one-file persona. The assembled snapshot (extending the hooks fixture pattern) installs both, binds them on a template, and drives a chat turn that starts the workflow and delegates to the persona, asserting `workflow/*` and `subagent/*` session events.

## Risks / Trade-offs

- [Subagent personas widen who can spawn children] → Personas run on the fixed spawn driver with a declared tool allowlist and delegation policy; depth/concurrency enforcement is the existing capability machinery, already tested for experts.
- [Workflow scripts run arbitrary code in worker threads] → Identical to the current model-authored workflow surface (worker threads isolate, not secure); trust + disclosure gates acquisition, documented as such.
- [Five kinds strain the single Kind union and per-kind market services] → The union is closed and compile-checked; per-kind services follow the repo's per-subsystem seam convention. A generic registry is explicitly rejected (D2).
- [Provider-name collisions across employees] → The subagent registry enforces globally unique provider names; the bridge registers `subagent__<id>` names derived from the persona id, and duplicate registration fails the composition loudly (same posture as the hook namespace).

## Migration Plan

Additive kinds and new packages; existing kinds untouched. Rollback: remove the two bridge plugins and market panels; installed packages become inert.

## Open Questions

None blocking; descriptor fields may grow (e.g. workflow input schemas) during implementation without changing the spec-level requirements.
