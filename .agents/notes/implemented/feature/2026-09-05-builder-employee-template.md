# Agent Note: Builder digital employee

Status: implemented

English | [中文](2026-09-05-builder-employee-template.zh.md)

## Problem

Creating a digital employee required administrator-level manual work in the configuration studio across six market asset kinds. No conversational path existed.

## Decision

A builder digital employee template wraps the configuration-studio remotes as six scoped authoring tools (`builder_list_assets`, `builder_create_draft`, `builder_validate_draft`, `builder_preview_draft`, `builder_publish_draft`). Three experts (requirements-reviewer, dry-run-tester, packager) decompose the interview-author-publish flow. Tools are registered in the builder composition only.

## Consequences

The builder creates drafts in the shared studio with the same validation; the user confirms before publish. Zip export is deferred to the `digital-employee-package-export` change.
