# @deepseek-ai/dsh-host-digital-employee-management

English | [中文](README.zh.md)

Typed Host gateway for digital employee management. `DigitalEmployeeManagementGateway` is published as `ctx.digitalEmployeeManagement` and exposes the Typert Remote namespace `digitalEmployees`; the Cordis service key differs from the existing Definition service key `ctx.digitalEmployees`, while the wire namespace keeps the public domain name.

## Remote Operations

The namespace exposes template and instance inspection; create, activate, deactivate, and delete lifecycle operations; atomic employee chat startup; memory listing and deletion; expert listing, continuation, interruption, and task-tree inspection; audit history; upgrade preview and apply; and credential-free export and fresh inactive import.

Remote method names are unique within `digitalEmployees` and describe management actions directly: `listTemplates`, `list`, `get`, `create`, `activate`, `deactivate`, `delete`, `startChat`, `listMemory`, `deleteMemory`, `listExperts`, `taskTree`, `continueExpert`, `interruptExpert`, `listAudit`, `previewUpgrade`, `applyUpgrade`, `exportEmployee`, and `importEmployee`. Namespace and method names are separate RPC path segments and may use the same domain vocabulary. Client namespace implementation members use bookkeeping-specific names so generated business methods are not accidentally reserved.

The gateway delegates all authority to `ctx.digitalEmployees`, `ctx.digitalEmployeeAgent`, and the live Agent registry. The browser client does not reproduce lifecycle, authorization, task ownership, memory, upgrade, or import validation.

`startChat` accepts a caller-generated Session ID, one submission identity, and non-empty text or encoded images. The Host resolves current employee availability, snapshots `ctx.agentDefaultModel`, creates the employee root Agent with the Host process working directory, admits attachments, derives a bounded employee-owned long-term memory query from accepted text, and queues the standard first user message as one operation. `automaticMemoryLimit` controls the positive result bound and defaults to 8; image-only tasks skip retrieval. Repeating the same submission shares its accepted result; reusing its identity with different task data is rejected. Validation, cancellation, attachment admission, memory retrieval, or first-message failure disposes unpublished work and returns no usable empty employee Session.

## Configuration Studio

Set `administrator: true` to enable local-only template configuration operations. `studioFile` selects the private user-owned JSON file that stores mutable drafts and publication provenance; relative paths resolve from the Host process working directory. The gateway materializes root and expert instructions under that file's directory when it creates a preview or publishes a version.

Administrators use `createConfigurationDraft`, `updateConfigurationDraft`, `validateConfigurationDraft`, `previewConfigurationDraft`, `disposeConfigurationPreview`, `publishConfigurationDraft`, `listConfigurationDrafts`, and `listConfigurationPublications`. Validation resolves preset, loadable Skill instructions, Tool, MCP client, credential-reference, authority, and delegation requirements before preview or publication. Configuration records carry credential references only; resolved credential values are neither accepted nor returned.

`listConfigurationAssets({ preset })` resolves the preset's standing scope and merges its Skill catalog with the optional Skill marketplace by stable Skill name. Scoped runtime presence determines whether a Skill can be selected; marketplace inventory supplies version, author, tags, and managed-installation provenance. Preset resolution failure rejects with a path-free diagnostic and never falls back to the Host-global registry. Validation and publication repeat the same scoped lookup. Catalog inspection creates no Agent, Session, turn, or model request.

Publishing assigns an immutable local version that the existing `listTemplates`, employee creation, and `previewUpgrade` operations resolve. A preview creates an isolated marked Session and temporary instruction files; disposing it removes both without adding an employee instance, memory, export, or normal management view. Long-term memory seeds in a local publication are promoted when an employee is created. A rejected seed rolls back the new employee so creation never leaves a partial configured instance.

The Web client refreshes the employee template roster when returning from **Template configuration** to **Employee operations**, so a successfully published version is immediately selectable. Test scaffolds must set `studioFile` inside their owned Harness Home: sharing that file across a Host restart preserves publications, while separate scaffold lifecycles remain isolated.

## Model Experience

### Management-triggered work

#### What the model sees

`startChat` creates the employee Agent and supplies its first standard user message, while `continueExpert` supplies the next user content to an existing expert. The employee Consumer owns all prompt, tool, and Session-event rendering.

#### Token effect

The gateway adds no tokens; request content changes only through the delegated employee or expert operation.

#### KV Cache effect

The gateway has no direct cache effect. Changes come from the employee Consumer's logged prompt projections.

## Known Limitations and Deferred Work

- **Remote management only** - the gateway requires mounted Definition, Provider, Agent Consumer, and live Agent services; it does not provide persistence or execution by itself.
