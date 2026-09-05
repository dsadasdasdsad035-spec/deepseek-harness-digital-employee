## Why

Building a digital employee today requires administrator-level manual work in the configuration studio: interviewing the user, choosing from six market asset kinds, filling draft fields, and validating. An in-chat "builder" digital employee can automate that interview-author-publish loop, making employee creation conversational.

## What Changes

- Add a `builder-employee-template` digital employee template (instructions, preset, experts) whose composition mounts authoring tools.
- Add authoring tools wrapping the existing configuration-studio remotes: `list_assets`, `create_draft`, `update_draft`, `validate_draft`, `preview_draft`, `publish_draft` — exposed only inside the builder's composition.
- Add an `employee-authoring` skill (the platform metadata handbook: six market asset kinds, authority semantics, naming rules, draft lifecycle).
- Add three built-in experts: requirements-reviewer, dry-run-tester, packager.
- Chat flow: user describes an employee -> builder interviews -> creates a draft via tools -> starts a preview session -> on approval publishes as a local template.

## Capabilities

### New Capabilities

- `builder-employee`: the builder template, its authoring tool surface, and the conversational build flow requirements.

### Modified Capabilities

(none — the studio remotes and draft lifecycle already exist; this change only wraps them)

## Impact

- New template plugin contributing the builder template with experts.
- Authoring tool registrations scoped to the builder composition.
- `packages/client` — nothing (the studio UI already covers drafts).
