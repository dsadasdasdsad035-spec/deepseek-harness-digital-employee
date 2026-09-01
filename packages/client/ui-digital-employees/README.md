# @deepseek-ai/dsh-client-ui-digital-employees

English | [中文](README.zh.md)

Browser workspace and chat entry integration for durable digital employee instances through the generated `digitalEmployees` Remote namespace.

It registers a sidebar footer action, occupies `shell.application` while open, contributes digital employees to the new-task `@` picker, and owns routed employee-chat submission. Lifecycle, task admission, memory, expert, task-tree, audit, upgrade, import, and export authority remains on the Host.

## Workspace

The workspace lists registered templates and durable instances, exposes lifecycle commands, and opens memory, expert, task-tree, audit, upgrade, import, and export views for the selected employee. Its **Start chat** action opens a distinct new-task composer with the active employee preselected; it does not create an employee Session until the user submits task content.

Destructive operations require an explicit UI confirmation. Upgrade apply follows preview, import creates a fresh inactive instance, and exported artifacts contain no credentials.

When the Host enables local administrator configuration, the workspace adds a separate **Template configuration** tab beside **Employee operations**. It lists drafts and publications, edits template metadata, root instructions, capability declarations, MCP references, expert definitions, and memory seeds, then shows validation diagnostics before preview or publish. Opening a draft and changing its preset reloads Skill availability from that preset. A bounded loading state and request generation guard prevent stale results from authorizing selections. Failed refreshes disable new Skill selection while selected unavailable names remain visible and removable. Skill rows show marketplace or local provenance, version, author, tags, and activation guidance; drafts persist only stable Skill names.

Skill, Tool, and MCP selectors combine active runtime registrations with marketplace metadata. Installed restart-pending assets remain visible but disabled, local non-marketplace Skills remain selectable, and unresolved references retained by an existing draft remain removable. Returning to **Employee operations** refreshes registered templates so a newly published version appears in the creation picker.

## Chat Entry

At the leading semantic position of a new-task composer, `@` discovery shows employee identity, template, and current availability. Selecting an active employee inserts one structured routing reference carrying the stable instance ID. The reference is omitted from model-visible text, and a composer cannot select a second employee or move its employee owner after task content.

Submission calls `digitalEmployees.startChat` with the remaining text and images. The client clears the submitted draft and selects the returned conversation only after Host acceptance. Validation, admission, or cancellation failure retains the employee reference, draft, and attachments for correction or retry. Existing conversations continue through ordinary Session delivery and cannot acquire an employee owner through a mention.

## Model Experience

### Browser-initiated work

#### What the model sees

Starting a chat or continuing an expert invokes `digitalEmployees` Remote methods; the Host-owned employee Consumer determines the prompt, tools, authority, and logged Session events. The structured employee reference itself is routing state and never enters prompt text.

#### Token effect

The browser package adds no tokens and sends only the user content required by the selected management operation.

#### KV Cache effect

The browser package has no direct cache effect.

## Known Limitations and Deferred Work

- **Host connection required** - the workspace has no offline mutation path and cannot manage employees while the generated Remote namespace is unavailable.
