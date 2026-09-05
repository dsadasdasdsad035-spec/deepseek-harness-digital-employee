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
