# `@deepseek-ai/dsh-builder-employee-template`

English | [中文](README.zh.md)

Builder digital employee that interviews users and assembles new digital employees from installed market assets.

## Authoring tools

Six tools wrap the configuration-studio remotes, registered only within the builder composition: `builder_list_assets`, `builder_create_draft`, `builder_validate_draft`, `builder_preview_draft`, `builder_publish_draft`.

## Experts

Requirements-reviewer, dry-run-tester, and packager decompose the interview-author-publish flow.

## Model Experience

### Authoring tools

#### What the model sees

The builder sees six `builder_*` tools for listing assets and driving the draft lifecycle. Other employees never see them.

#### Token effect

Six short tool schemas, stable while the builder template is unchanged.

#### KV Cache effect

No invalidation; the tools are constant.

## Known Limitations and Deferred Work

- **Builder-only tools** — the six `builder_*` tools register in the builder composition only; no other employee surface can drive drafts.
- **Publish confirmation stays with the user** — the builder publishes through the same studio validation, but the confirming click is never the model's.
- **Single template preset** — the builder composes one fixed preset; per-deployment preset overrides are not configurable.
