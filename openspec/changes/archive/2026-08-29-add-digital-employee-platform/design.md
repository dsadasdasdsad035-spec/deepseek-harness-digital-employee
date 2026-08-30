## Context

See `proposal.md` for motivation and the five delta specs for required behavior. DeepSeek Harness already owns Agent execution, durable Sessions, system prompt contributions, preset composition, skill and tool registries, credentials, workflows, and subagent providers. The implementation must compose these plugins rather than add employee-specific branches to `agent-loop`.

Digital employee templates are trusted plugin contributions, while instance files, imported employee data, memory records, tool arguments, MCP responses, and wire operations cross validation boundaries. Anything made visible to a model must be reconstructable from Session events. Capability registration and cleanup must remain Cordis effects.

## Goals / Non-Goals

**Goals:**

- Establish a complete digital employee Service Definition / Provider / Consumer capability.
- Keep reusable template definitions separate from durable instance data.
- Resolve employee and expert compositions explicitly before Agent creation.
- Enforce non-escalating capability inheritance across all delegation depth.
- Preserve memory provenance, model-input reconstruction, and lifecycle cleanup.
- Support Host, Web, TypeScript SDK, Python SDK, example, snapshot, and invariant surfaces.

**Non-Goals:**

- Implement a second Agent loop or a separate subagent runtime.
- Treat arbitrary downloaded employee bundles as trusted executable plugins.
- Store raw credentials in employee templates, instances, exports, memories, or events.
- Add autonomous template self-modification or automatic permission expansion.
- Build semantic vector retrieval in the first vertical slice; the memory provider interface permits later implementations.

## Decisions

### Add a digital employee capability with Definition, Provider, and Consumer roles

A new core package will define branded template and employee instance IDs, template and instance records, lifecycle requests/results, memory contracts, expert descriptors, resolved compositions, events, and the `DigitalEmployees` Cordis service. A file-backed provider will persist instances and long-term memory beneath the user data root using a monotonic schema version and atomic publication. Host/API Remote and Web consumer packages will expose typed management operations.

Keeping these roles separate allows an alternative database or enterprise policy provider without changing templates or UI. Embedding instance storage into preset or Web packages was rejected because those packages do not own employee lifecycle or durable memory.

### Treat templates as immutable plugin contributions and instances as mutable data

Plugins register versioned `DigitalEmployeeTemplate` contributions through effects. A template contains literal metadata and references to `AGENTS.md`, skills, tools, MCP declarations, experts, and policy defaults. Employee instances store a selected template version, display identity, validated overrides, granted capabilities, lifecycle state, and storage references.

Instances never copy executable plugin code. Template removal leaves affected instances inspectable but unable to start new tasks until their exact version returns or an explicit migration selects another version. Automatically choosing the newest version was rejected because it would change instructions and authority without review.

### Resolve every task into an existing Agent composition

Before task creation, the owning provider resolves the employee instance into a required `ResolvedDigitalEmployee` value. A bridge plugin projects identity and personality into system prompts, scopes template skills through the existing skill registry, selects registered tools, materializes MCP client references, exposes the expert catalog, and chooses an existing preset for the root Agent.

The resolver fails before Session creation when required references or credentials are unavailable. Defaults live in the resolver rather than inside execution. No employee condition is added to `agent-loop`.

### Implement experts as named, constrained subagent compositions

An expert is a template-owned descriptor, not a new Agent class. `delegate_to_expert` resolves the descriptor and uses the existing subagent provider to create either a one-shot or continuable child Session. The child receives expert `AGENTS.md`, model options, allowed memory projection, and a capability set computed as:

```text
template expert allowlist
intersection employee instance grants
intersection parent Agent effective capabilities
```

Nested expert and generic subagent creation use the same inherited authority object and enforce maximum depth, per-employee concurrency, timeout, and allowed expert edges. Existing list, send, interrupt, completion delivery, and durable parent relationships remain authoritative. A separate expert runtime was rejected because it would duplicate cancellation, continuation, restoration, and delivery semantics.

### Use layered memory with an explicit promotion pipeline

Task memory is owned by one delegated task, Session memory is represented by durable Session events and summaries, and long-term memory belongs to an employee instance. Agents submit structured memory candidates rather than writing long-term storage directly. The provider validates ownership, sensitivity flags, provenance, retention, and duplication before recording acceptance or rejection.

The first provider uses deterministic metadata and text matching behind a retrieval interface. A later vector provider can replace retrieval without changing employee or event contracts. Every model-visible retrieval writes an event containing stable memory IDs and the rendered projection. Experts receive only the resolver-selected subset; long-term promotion remains governed by employee policy.

### Make capability authority explicit and monotonic

Template declarations, instance grants, and inherited Agent authority use branded resource IDs grouped by skill, tool, MCP server, expert, and subagent policy. Resolution intersects these sets and never falls back to the ambient registry. Child authority can only remove entries and tighten numeric limits.

MCP templates contain configuration and credential references. Connections are established in the employee or expert Context and disposed with its fiber. Audit events record service and operation metadata but redact arguments and results according to MCP policy and never contain resolved secrets.

### Log model-visible employee inputs and operational decisions

New required-on-read Session events record the resolved employee identity, instruction revision, memory projection, expert delegation, expert result delivery, and memory promotion decision. Structural event fields update TypeScript and Python SDK expected outputs together. Management-only audit records that are not part of model reconstruction use the employee store, linked by employee and Session IDs.

This separation prevents the Session log from becoming a general administrative database while preserving the model-visible equals logged invariant.

### Provide an operational Web workspace

The Web consumer adds employee list and detail views with identity, memory, capabilities, experts, task tree, audit, and lifecycle actions. It reuses existing settings, conversation, subagent status, and confirmation patterns. The first screen is the usable employee workspace rather than a marketing page.

Destructive deletion requires confirmation and reports active owned resources. Template upgrades show reference and permission differences; new capabilities are ungranted by default. Export/import excludes credentials and live Agent state.

### Deliver the feature as vertical slices

Implementation proceeds through a minimal assembled employee first: template registration, one durable instance, explicit composition, one task, and one expert delegation. Memory promotion, scoped MCP, lifecycle management, Web UI, and portability follow on the same stable service contracts. Each slice adds package tests plus a runnable keyless example and snapshot when it changes model or user-visible behavior.

Building all storage and UI before an assembled task was rejected because it would defer the highest-risk integration among presets, scoped tools, Sessions, and subagents.

## Risks / Trade-offs

- [Risk] The feature spans many existing capabilities and could become a second composition framework. -> Mitigation: resolve to existing preset, prompt, skill, tool, MCP, workflow, and subagent extension points; prohibit employee branches in `agent-loop`.
- [Risk] Expert delegation could accidentally expand authority. -> Mitigation: carry explicit effective authority in every resolution and test each child set and limit as a subset of its parent.
- [Risk] Long-term memory can retain sensitive or incorrect information. -> Mitigation: require structured candidates, provenance, policy decisions, inspection, deletion, and bounded retrieval; do not default to automatic transcript retention.
- [Risk] Template upgrades can silently change behavior. -> Mitigation: pin exact versions, validate before mutation, display diffs, and require approval for new grants.
- [Risk] MCP configuration may leak credentials through exports or logs. -> Mitigation: store only credential references and add invalid-case tests for events, exports, errors, and audit payloads.
- [Risk] Durable instance and memory files can be corrupted or partially written. -> Mitigation: schema validation, monotonic versions, atomic replacement, startup diagnostics, and rollback-safe migrations.
- [Risk] Agent trees can consume unbounded resources. -> Mitigation: enforce depth, concurrency, timeout, and cancellation at creation and retain existing subtree interruption semantics.

## Migration Plan

1. Introduce service definitions, template registry, and file provider with no default templates.
2. Add an example employee template and assembled CLI/headless task proving task composition and one expert delegation.
3. Add memory candidates, long-term provider, retrieval events, and SDK projections.
4. Add scoped MCP clients, capability audit, lifecycle operations, and Host/API Remote.
5. Add Web management views, import/export, template upgrade flow, and built application smoke coverage.
6. Enable the feature in selected bundles after focused, snapshot, build, hygiene, and documentation gates pass.

Rollback removes bundle composition while retaining employee files for a later compatible build. Before the first tagged format, incompatible stored records fail loudly rather than receiving compatibility shims.
