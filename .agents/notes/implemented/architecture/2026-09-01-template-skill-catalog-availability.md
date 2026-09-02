# Agent Note: Template Skill catalog availability

Status: implemented

English | [中文](2026-09-01-template-skill-catalog-availability.zh.md)

## Problem

Template authors need one Skill selector even though installation provenance and runtime composition come from different services. Treating marketplace installation as runtime availability would allow drafts to select Skills that the current Host cannot compose. Treating the runtime registry as the complete catalog would hide installed Skills that need a restart and omit marketplace metadata.

## Decision

The digital employee management Gateway owns the client-safe join. It resolves the draft's Agent preset through `agentPresets.standingKeyFor()`, reads `skills.list({ scope })`, and merges that scoped runtime catalog with optional Skill marketplace inventory by stable Skill name. Presence in the selected preset scope is the sole availability signal. Marketplace inventory contributes description, version, author, tags, managed provenance, and restart metadata. Scoped runtime-only Skills remain selectable local entries. Marketplace-only Skills remain visible but unavailable.

Templates persist only Skill names. Marketplace metadata is display state and is never copied into drafts. A selected name missing from both inventories is synthesized by the editor as an unavailable removable reference. The Gateway does not return installation paths, archive filenames, or credential values.

Catalog inspection reuses the preset service's standing single-flight composition. It does not create an Agent, Session, turn, conversation, or model request. Draft validation and publication resolve the same scoped catalog independently of browser state.

## Alternatives considered

**Use marketplace installation as availability.** Rejected because installation publication and runtime activation can be separated by Host composition or restart.

**List only runtime Skills.** Rejected because administrators would not see installed inactive Skills or the action required to activate them.

**Persist marketplace metadata in templates.** Rejected because copied metadata becomes stale and couples immutable template authority to mutable catalog presentation.

**Read the Host-global Skill registry.** Rejected because preset-owned filesystem providers and restrictions are absent from that view, so template availability would differ from employee composition.

## Consequences

The first read may mount the preset's standing providers, including filesystem watchers, while concurrent reads share that composition. Changing a draft preset reloads the catalog; stale responses cannot replace the newest result, and failed refreshes disable new selections while retaining removable selected names.
