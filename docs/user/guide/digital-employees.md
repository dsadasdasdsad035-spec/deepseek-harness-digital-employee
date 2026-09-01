# Manage digital employees

English | [中文](digital-employees.zh.md)

Open **Digital employees** from the Web UI sidebar. The workspace manages durable employee instances while the Host keeps lifecycle, authority, memory, expert, upgrade, import, and export validation.

## Create and activate

Choose a registered template version, enter a display name and optional personality override, and select grants from the template's declared capabilities. Creation produces an inactive instance pinned to that exact template version. Review the instance, then activate it before starting work.

## Configure templates

When the Host enables local administrator configuration, choose **Template configuration** in the Digital employees workspace. Create a draft with its instructions, capabilities, MCP references, expert definitions, and creation-time memory seeds. Validate the draft before preview or publish; validation reports unavailable references and authority errors without exposing credential values.

The Skills selector combines installed marketplace Skills with local runtime Skills. Marketplace rows show version, author, tags, and activation guidance. An installed Skill remains disabled until the Host runtime activates it, while local Skills can be selected immediately. If a draft still names an uninstalled Skill, remove that unavailable reference before validation.

Preview composes a temporary employee Session and does not change employee instances or durable memories. Publishing creates an immutable local template version that appears in the normal template picker. Existing employees remain pinned until their upgrade is explicitly reviewed and applied.

## Start an employee chat

Open a new task and type `@` before any task text. The picker shows digital employee identity, template, and availability. Select one active employee, then enter the task and optional images. Employee selection is structured state backed by the stable employee ID; its visible label is not sent to the model.

Only one employee can own a new task, and the employee must remain at the leading semantic position. Existing conversations do not accept employee mentions. Submitting empty text without an image does not create an employee Session.

The Host validates that the employee is active and its exact template composition remains available, then creates the employee-owned root Session and accepts the task as its first user message in one operation. The Web UI opens the returned conversation only after acceptance. If validation, attachment admission, cancellation, or first-message handling fails, the current employee selection, draft, and attachments remain in the composer and no usable empty employee Session is left behind.

From the employee management workspace, choose **Start chat** to open a distinct new-task composer with that employee preselected. This action does not create a Session until task content is submitted.

The accepted task uses the template's preset, instructions, explicit skills and MCP servers, retrieved employee memory, and effective employee authority.

## Work with experts

The Experts view lists the employee's named experts. Delegation uses the existing subagent runtime; the task tree shows one-shot and continuable descendants. Continue or interrupt a continuable expert from its direct parent task.

## Review memory and audit

The Memory view lists employee-owned task, Session, and long-term records. Deleting a record affects only that employee. Sensitive or over-retention promotion candidates may be rejected by Host policy.

The Audit view records attributable management and task decisions. Each employee-owned root Session records the creation-time employee ID, template ID and version, and resolved composition ID. Model-visible identity, instructions, memory projections, expert outcomes, and memory decisions are retained as Session events so replay reconstructs the same input and historical ownership survives employee rename, upgrade, deactivation, or removal.

## Upgrade, export, and import

An employee remains pinned when a newer template version is registered. Preview an upgrade to inspect capability changes, then apply it with explicit reviewed grants.

Export creates a portable artifact without credentials. Import assigns a fresh employee identity and creates an inactive instance; inspect and activate it before use.

Deactivate an employee to prevent new tasks. Deletion enters the deleting state and completes only after owned work has drained.
