## Context

See `proposal.md` for motivation. The current digital employee management action generates a Session ID and calls the Host `runTask` operation, which creates the employee root Agent but does not accept task content or connect the result to conversation navigation.

The conversation composer already maintains structured reference occurrences, serializes owned references before ordinary message delivery, preserves draft state across failed submissions, and associates every input facade with one Session context. The new-task experience must use those extension points without making the generic conversation package depend directly on digital employee packages.

Digital employee composition already resolves instance identity, personality, skills, tools, MCP clients, experts, permissions, and memory for a root Agent. The chat entry point selects that existing composition; it does not introduce another employee runtime.

## Goals / Non-Goals

**Goals:**

- Represent employee selection as structured client state backed by a stable employee instance ID.
- Provide one Host operation that validates the employee, creates its root Agent/Session, and accepts the first user message.
- Preserve the source composer until the complete startup operation succeeds.
- Keep employee-specific discovery and routing behind plugin contributions to generic conversation services.
- Make management `Start chat` and direct `@` selection converge on the same client and Host path.

**Non-Goals:**

- Delegating from an existing ordinary conversation to an employee.
- Selecting multiple employees, experts, or subagents in one composer submission.
- Routing by parsing plain-text display names on the Host.
- Changing expert, memory, capability, MCP, or agent-loop behavior.

## Decisions

### Use a routing reference instead of serialized prompt text

The employee picker contributes a structured reference occurrence whose payload identifies the employee instance. The reference is valid only at the leading semantic position of a new-task composer and is consumed by a routing submission handler rather than serialized into model-visible text.

This preserves editing, invalidation, undo, redo, and visual token behavior already owned by the input system while keeping employee identity out of free-form parsing. A plain-text `@name` command was rejected because names can change or collide and cannot reliably carry instance ownership.

The input reference contract will distinguish model references from routing references, or introduce an equivalent typed submit claim that owns the employee occurrence. The generic composer only executes the winning submission contribution; the digital employee client plugin owns employee lookup, display, validity, and task-start invocation.

### Restrict selection to the new-task entry context

An employee may be selected only before a root Session has an employee owner and before non-whitespace task content. Each submission contains at most one employee reference. Once an employee Session is selected, subsequent messages use normal Session delivery and do not repeat the mention.

Allowing mid-conversation delegation was rejected because it would blur memory, capability, permission, and audit ownership. Multi-recipient semantics are deferred because they require a separate orchestration model.

### Add an atomic Host task-start operation

The Remote request carries the stable employee ID, caller-generated Session ID, first user content, supported attachments, and submission identity needed for idempotent admission. The Host operation validates current employee state, resolves the employee composition, creates the root Agent/Session, accepts the first message through the standard message path, and returns the published Session ID.

The operation must not leave a user-visible empty Session when validation, composition, or first-message acceptance fails. The owning Host services will provide either staged publication with cleanup or an equivalent transaction around creation and first-message admission. Reusing the current two-step `runTask` plus client-side send was rejected because its partial-failure state is observable.

### Record employee ownership in required Session events

The employee root Session records stable employee instance ID, template ID, template version, and resolved composition identity as required-on-read data. Existing message events record the first user content, and existing composition events continue to reconstruct every model-visible instruction and capability.

Display names may be included as creation-time presentation data but are not identifiers. Historical Sessions keep their recorded ownership when an employee is renamed, upgraded, deactivated, or removed from the active picker.

Any Session event change updates the known event registry, persistence/projection behavior, TypeScript SDK output, and Python SDK output together. The format version changes only if the structural log format changes, not merely because a new required event type is introduced.

### Converge management and chat entry points

The management workspace replaces `Run task` with `Start chat`. It asks the shared Web shell to open the new-task conversation entry with a preselected structured employee reference. No Host task exists until the user supplies task content and submits.

Direct `@` selection and management preselection therefore share validation, submission, failure handling, and navigation. The management workspace remains the owner of lifecycle and inspection actions.

### Keep Remote namespace composition explicit

The employee task-start method remains under the existing digital employee Remote namespace and uses a method name that does not collide with a namespace service contribution. Client and Host Typert faces, resolver manifests, and Web bundle composition are updated as one published path.

## Risks / Trade-offs

- [Risk] Extending references with routing semantics could couple generic input behavior to task creation. → Mitigation: expose a typed plugin-owned submission contribution and keep employee knowledge out of `ui-conversation`.
- [Risk] Session creation may succeed before first-message admission fails. → Mitigation: stage publication or register deterministic cleanup in the Host operation and test every failure point.
- [Risk] Picker state can become stale while the management state changes. → Mitigation: refresh invalidation in the client for affordance and always repeat authoritative checks on the Host.
- [Risk] Required ownership events affect persistence and both SDK projections. → Mitigation: update event registry, restore tests, TypeScript and Python generated expectations, and keyless snapshots in the same change.
- [Risk] Preselecting an employee while carrying an unrelated draft could surprise users. → Mitigation: management `Start chat` opens a distinct new-task composer and does not overwrite a non-empty existing draft.

## Migration Plan

1. Add the durable employee ownership event and projections while retaining the existing management action.
2. Add the atomic Host and Remote task-start path and assembled tests.
3. Add the employee mention source and new-task routing submission.
4. Switch management `Run task` to `Start chat` after the shared path is available.
5. Update snapshots and documentation, then remove the obsolete empty-task client path.

Rollback restores the previous management action and removes the mention contribution. Sessions already created with employee ownership events remain readable because the rollback must retain the event reader and projections until those Sessions are no longer supported.
