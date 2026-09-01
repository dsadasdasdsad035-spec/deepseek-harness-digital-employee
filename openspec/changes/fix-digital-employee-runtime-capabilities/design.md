## Context

See `proposal.md` for motivation and the delta specs for observable requirements.

Digital employee composition mounts the selected preset beneath an unpublished Agent scope, then intersects the Skill and Tool registries with the resolved employee authority. The model-facing Skill consumer registers a Tool named `skill` and publishes `<available_skills>` only while that exact Tool definition is visible to the Agent. A preset contribution is inherited by the employee Agent scope, so the employee's business Tool restriction can remove the loader even while the independent Skill restriction retains authorized Skill definitions.

The Web mention route sends an employee ID and initial task to the Host. The Host resolves the employee and starts `DigitalEmployeeAgent.createTask`, but it currently omits the optional memory retrieval request. The assembled project-manager fixture supplies memory explicitly and inspects the Skill registry directly, so it does not exercise the production startup behavior or prove model-visible Skill loading.

## Goals / Non-Goals

**Goals:**

- Make Skill invocation infrastructure an owned part of digital employee Agent composition.
- Preserve existing Skill and business Tool capability identifiers and authorization semantics.
- Reuse the same effective composition for validation, preview, mention-started work, and assembled tests.
- Derive a bounded long-term memory query at the Host task-start boundary from the accepted initial task.
- Prove model-visible catalog publication and a real Skill load in a keyless runnable composition.

**Non-Goals:**

- Change the generic Tool registry's restriction semantics for non-employee Agents.
- Add `skill` to the Tool marketplace or persisted template Tool grants.
- Automatically persist conversation text as long-term memory.
- Change Skill package formats, marketplace installation, MCP authorization, or memory ranking algorithms.
- Introduce compatibility handling for templates that depend on unavailable Skills; invalid compositions continue to fail loudly.

## Decisions

### 1. Mount Skill invocation infrastructure in the employee Agent's own scope

When the resolved employee authority contains model-invocable Skills, digital employee Agent composition will mount the existing model-facing Skill consumer into the exact employee Agent scope after applying inherited business Tool restrictions. Its Tool registration is therefore owned by that scope and remains visible under the Tool registry's established rule that restrictions filter inherited capabilities but not infrastructure registered by the restricted scope itself.

The mounted consumer continues to read the Agent-scoped Skill registry, so the employee Skill restriction remains authoritative. The catalog and loader expose only Skills admitted by `employee.authority.skills`; mounting the loader does not grant additional Skill definitions.

This lifecycle must be registered through the Agent context's effects and disposed with the Agent. If an exact-scope Skill consumer is already present, composition must avoid duplicate registration or surface a deterministic composition diagnostic.

Alternatives considered:

- Add `skill` to every template's Tool grant. Rejected because it leaks implementation infrastructure into administrator-facing business authorization and existing templates remain easy to misconfigure.
- Exempt the name `skill` inside generic Tool restriction logic. Rejected because ToolRegistry cannot infer that an arbitrary same-name registration is trusted infrastructure, and the change would affect every Agent type.
- Require every preset to mount the consumer. Rejected as the sole mechanism because preset registrations remain inherited by the employee Agent and are still filtered by the later business Tool restriction.

### 2. Validate the effective employee composition, not declarations alone

Template validation and preview will use the same composition path that creates an employee Agent. For Skill-enabled templates, validation will assert all of the following in the resulting Agent scope:

- every authorized Skill resolves from the selected preset;
- the exact model-facing Skill loader is visible;
- the model-facing catalog contains the authorized model-invocable Skill names;
- the loader can resolve an authorized Skill definition without executing business behavior.

Diagnostics will identify whether the missing element is the preset Skill, Skill invocation infrastructure, or an authorization mismatch. Persisted capability arrays remain unchanged.

Alternative considered: validate only that Skill names appear in the merged template catalog. Rejected because that is the existing false-positive path: registry presence does not prove model discovery or invocation.

### 3. Derive ordinary task memory retrieval at the Host start boundary

The Host operation that accepts a mention-started employee task will construct a `DigitalEmployeeMemoryRequest` from the accepted initial user text:

- `text` is the normalized textual task content accepted for the first message;
- `scopes` contains the product-defined `long-term` scope;
- `limit` comes from validated Host configuration with a conservative default.

The Host passes this request to `createTask`. An explicit request supplied by an internal specialized caller continues to take precedence. If the accepted task has no retrievable text, composition proceeds without a query instead of broad retrieval. Empty results create no fabricated memory content, while successful projections continue to use the existing durable Session event.

The limit is configurable because deployment size and model context budgets vary. Employee ownership, long-term scope selection, sensitivity handling, and attribution remain fixed policy rather than tunables.

Alternative considered: let the browser send memory query fields. Rejected because ordinary users should provide a task, not retrieval configuration, and the Host owns employee authorization and memory isolation.

### 4. Turn the project-manager snapshot into a behavioral proof

The project-manager preset will remain limited to its three business Skills and two business Tools. The assembled fixture will start through the ordinary employee task-start path and use a deterministic mock model sequence that:

1. observes the model request's `<available_skills>` catalog;
2. calls `skill` for `risk-review` or another declared fixture Skill;
3. verifies the returned package-owned instructions enter the transcript;
4. calls the declared business Tool and MCP Tool;
5. consumes the automatically retrieved Atlas memory.

Acceptance output will distinguish declared capabilities, model-visible Tools, selected Skill attribution, loaded Skill content, MCP activity, and memory projection. Direct registry listing may remain diagnostic evidence but cannot satisfy the Skill acceptance path.

### 5. Cover the real Web route without depending on a real model

Web E2E will create or select the project-manager employee, submit it through the `@` composer flow, and assert that the resulting Session is employee-owned and reaches the deterministic assembled backend. The keyless snapshot owns detailed model transcript assertions; Web E2E owns routing and visible failure/success behavior.

This division keeps browser coverage stable while ensuring the full Host composition is exercised elsewhere.

## Risks / Trade-offs

- [Exact-scope consumer duplicates a preset or future composition contribution] → Detect the effective definition during composition and keep one deterministic owner; add assembled tests for presets both with and without an inherited consumer.
- [Automatically querying memory adds latency to every employee task] → Keep retrieval bounded, skip it when no textual query exists, and reuse the existing indexed memory provider.
- [Initial task text is too broad and retrieves weak matches] → Preserve the memory provider's relevance threshold and bounded result count; ranking changes remain outside this change.
- [Validation performs asynchronous Skill discovery and becomes slower] → Reuse registry snapshots and limit validation to authorized names plus the loader path.
- [Snapshot mock behavior can still bypass the real loader] → Require durable `skill/selected` attribution and returned Skill content in addition to checking the mock's requested Tool name.

## Migration Plan

1. Add exact-scope Skill infrastructure composition and effective validation while retaining existing persisted template and employee records.
2. Update the project-manager preset/fixture and focused unit tests.
3. Add automatic Host memory request derivation and route coverage.
4. Refresh the keyless project-manager transcript only after the assembled assertions pass.
5. Restart the Web profile so changed plugin composition is active.

Rollback removes the automatic exact-scope consumer and Host-derived memory request. No on-disk schema or template migration is required.
