## Context

The configuration studio already exposes draft CRUD, validation, preview, and publication as Typert remotes, and `listDigitalEmployeeConfigurationAssets` joins installed market assets into one catalog. The hooks/workflows/subagents changes gave templates first-class asset references. A builder employee is therefore a composition problem, not a new capability problem.

## Decisions

- **D1: Tools wrap remotes, not internals.** Each authoring tool calls the existing management gateway methods; no new draft logic.
- **D2: Mount once, scope by authority.** The template plugin registers the five `builder_*` tools on the host tools registry at mount; the template and each expert list only the tool ids their role needs in `capabilities.tools`, so other compositions never see them.
- **D3: Publish over export.** The primary output is a published local template (user sees it in "new employee"); zip export is deferred to `digital-employee-package-export`.
- **D4: Experts mirror the existing expert pattern** from the project-manager-test template (one-shot delegation, file instructions, constrained capabilities): requirements-reviewer sees assets, dry-run-tester validates and previews, packager publishes.
- **D5: No update wrapper.** The chat surface wraps five remotes; `updateConfigurationDraft` has no `builder_*` wrapper, so corrections re-run `builder_create_draft` with the full payload.

## Risks

- [Builder drafts bypass administrator intent] -> Drafts created by the builder land in the same studio with the same validation and explicit publish confirmation; the user approves before publish.
