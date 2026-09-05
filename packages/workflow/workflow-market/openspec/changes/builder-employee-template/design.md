## Context

The configuration studio already exposes draft CRUD, validation, preview, and publication as Typert remotes, and `listDigitalEmployeeConfigurationAssets` joins installed market assets into one catalog. The hooks/workflows/subagents changes gave templates first-class asset references. A builder employee is therefore a composition problem, not a new capability problem.

## Decisions

- **D1: Tools wrap remotes, not internals.** Each authoring tool calls the existing management gateway methods; no new draft logic.
- **D2: Scope tools to the builder.** Registration happens in the builder template plugin's composition path (same scoped-registration pattern as the expert delegation tool), so only the builder composition exposes them.
- **D3: Publish over export.** The primary output is a published local template (user sees it in "new employee"); zip export is deferred to `digital-employee-package-export`.
- **D4: Experts mirror the existing expert pattern** from the project-manager-test template (one-shot, file instructions, constrained capabilities).

## Risks

- [Builder drafts bypass administrator intent] -> Drafts created by the builder land in the same studio with the same validation and explicit publish confirmation; the user approves before publish.
