## Why

Building a digital employee today requires administrator-level manual work in the configuration studio: interviewing the user, choosing from six market asset kinds, filling draft fields, and validating. An in-chat "builder" digital employee can automate that interview-author-publish loop, making employee creation conversational.

## What Changes

- Add a `builder-employee-template` digital employee template (instructions, preset, experts) whose plugin mounts authoring tools.
- Add authoring tools wrapping the existing configuration-studio remotes: `builder_list_assets`, `builder_create_draft`, `builder_validate_draft`, `builder_preview_draft`, `builder_publish_draft` — visible only to compositions whose authority allowlist grants them (no update wrapper; corrections re-create the draft).
- Add three built-in experts: requirements-reviewer, dry-run-tester, packager.
- Chat flow: user describes an employee -> builder interviews -> creates a draft via tools -> starts a preview session -> on approval publishes as a local template.

## Deferred

- The `employee-authoring` skill (platform metadata handbook: six market asset kinds, authority semantics, naming rules, draft lifecycle) moves to a follow-up change; the builder template's AGENTS.md covers the interview flow today.

## Capabilities

### New Capabilities

- `builder-employee`: the builder template, its authoring tool surface, and the conversational build flow requirements.

### Modified Capabilities

(none — the studio remotes and draft lifecycle already exist; this change only wraps them)

## Impact

- New template plugin contributing the builder template with experts.
- Authoring tools mounted by the template plugin on the host tools registry; visibility scoped per composition through authority allowlists.
- `packages/client` — nothing (the studio UI already covers drafts).
