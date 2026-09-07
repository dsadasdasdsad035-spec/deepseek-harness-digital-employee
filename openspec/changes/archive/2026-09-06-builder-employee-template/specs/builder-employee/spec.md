## Purpose

Enable conversational employee assembly: an in-chat builder employee interviews the user and assembles configuration drafts from installed market assets, then publishes approved drafts as local templates.

## ADDED Requirements

### Requirement: Builder template composition mounts authoring tools
The system SHALL contribute a builder digital employee template whose plugin mounts authoring tools — asset listing and configuration-draft create, validate, preview, and publish — visible only to compositions whose authority allowlist grants them.

#### Scenario: Authoring tools are visible only to the builder
- **WHEN** the builder employee's composition mounts
- **THEN** the authoring tools are registered in that composition
- **THEN** another employee's composition does not expose them

### Requirement: Conversational build flow
The system SHALL let the builder create a configuration draft from chat, validate it, start a preview, and publish it as a local template on user approval.

#### Scenario: Chat creates and publishes a draft
- **WHEN** a user describes an employee and the builder completes the interview flow
- **THEN** a validated draft exists and publish produces a new local template version

#### Scenario: Invalid draft is reported in chat
- **WHEN** validation reports diagnostics for a draft the builder created
- **THEN** the builder reports the named diagnostics to the user without publishing
