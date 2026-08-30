## 1. Service Definition and Contracts

- [x] 1.1 Add the digital employee Service Definition package with branded template, instance, memory, expert, authority, lifecycle, and audit identifiers and records.
- [x] 1.2 Define merge-extensible template contributions, the `DigitalEmployees` service API, typed events, configuration validation, and Definition package exports with required JSDoc.
- [x] 1.3 Add contract tests for template validation, duplicate registration disposal, request parsing, branded IDs, and invalid lifecycle transitions.

## 2. Template Registry and Durable Provider

- [x] 2.1 Implement effect-owned registration and lookup for immutable, versioned digital employee templates, including eager validation of required references.
- [x] 2.2 Implement the file-backed instance store beneath the user data root with a monotonic schema version, atomic replacement, startup diagnostics, and independent instance state.
- [x] 2.3 Implement explicit instance resolution that pins the exact template version and produces a complete `ResolvedDigitalEmployee` or fails before Session creation.
- [x] 2.4 Add provider tests for persistence, corruption rejection, missing template versions, unresolved resources, cleanup, and isolation between instances sharing a template.

## 3. Root Employee Composition

- [x] 3.1 Add a bridge Consumer that projects employee identity, personality, template `AGENTS.md`, and instance overrides into the existing system prompt and preset composition extensions.
- [x] 3.2 Scope registered skills and tools to the resolved employee authority without exposing ambient registry entries.
- [x] 3.3 Add task creation that resolves an active employee before creating the root Session and records the resolved employee identity and instruction revision.
- [x] 3.4 Add an example template and keyless assembled application path that creates an employee and runs one root task through the existing Agent loop.

## 4. Layered Memory

- [x] 4.1 Define task, Session, and long-term memory records, retrieval requests, promotion candidates, policy decisions, provenance, sensitivity, and retention fields.
- [x] 4.2 Implement employee-owned long-term memory persistence and deterministic bounded retrieval using metadata and text matching.
- [x] 4.3 Implement the promotion pipeline with ownership validation, duplicate handling, retention and sensitivity policy, and explicit accepted or rejected decisions.
- [x] 4.4 Add Session events and prompt projection for model-visible memory IDs and rendered content, and support inspection and deletion by employee ownership.
- [x] 4.5 Add tests for scope isolation, bounded retrieval, provenance, promotion rejection, duplicate handling, retention, deletion, and reconstruction after Session restore.

## 5. Expert Agent Delegation

- [x] 5.1 Resolve template expert descriptors into named subagent compositions with expert instructions, model settings, memory projection, and stable expert IDs.
- [x] 5.2 Implement `delegate_to_expert` for one-shot and continuable child Sessions by reusing the existing subagent provider and durable parent relationships.
- [x] 5.3 Compute child authority as the intersection of expert allowlists, employee grants, and parent effective authority, while tightening depth, concurrency, timeout, expert-edge, and subagent limits.
- [x] 5.4 Expose expert catalog, list, follow-up, interruption, completion delivery, and subtree status through existing Agent and subagent lifecycle operations.
- [x] 5.5 Add Session events for delegation inputs, authorization denials, expert results, and memory decisions so restored parents reconstruct expert work.
- [x] 5.6 Add tests for one-shot and continuable experts, nested expert and generic subagent delegation, authority non-escalation, depth and concurrency rejection, timeout, interruption, and restoration.

## 6. MCP, Capability Attribution, and Audit

- [x] 6.1 Resolve employee and expert MCP declarations into context-owned clients using credential references and dispose connections with their Cordis fibers.
- [x] 6.2 Fail at the earliest resolvable point when required credentials or MCP configuration are unavailable, without persisting resolved secrets.
- [x] 6.3 Record attributable skill selection, tool calls, MCP operations, permission denials, and capability configuration changes with employee, Session, and acting Agent IDs.
- [x] 6.4 Add invalid-case tests proving templates, files, exports, Session events, diagnostics, and audit payloads cannot contain credential values and child contexts cannot register unauthorized capabilities.

## 7. Lifecycle and Portability

- [x] 7.1 Implement typed create, activate, deactivate, inspect, and delete operations with lifecycle-state validation and deactivated task rejection.
- [x] 7.2 Implement deletion orchestration that terminates owned Agent work and MCP connections before removing instance state, long-term memory, and indexes.
- [x] 7.3 Implement template upgrade preview and apply operations with reference validation, capability differences, explicit grants for new capabilities, and rollback-safe persistence.
- [x] 7.4 Implement versioned employee export and import for template references, overrides, authorization metadata, and optional memory while excluding credentials and live Session state.
- [x] 7.5 Add lifecycle tests for active work deletion, failed upgrade immutability, new capability approval, import validation, export redaction, and round-trip portability.

## 8. Host, API Remote, and Web Client

- [x] 8.1 Add Host and API Remote operations for templates, employees, tasks, memory, capabilities, experts, Agent trees, audits, upgrades, imports, exports, and lifecycle actions with non-conflicting RPC namespaces.
- [x] 8.2 Add generated or declared Web client types and integration tests covering success, validation errors, authorization failures, and transport method routing.
- [x] 8.3 Build the employee list and detail workspace with identity, lifecycle state, capabilities, experts, memory, task tree, and audit views using existing Web interaction patterns.
- [x] 8.4 Add create, activate, deactivate, run task, interrupt, continue, memory delete, upgrade review, import, export, and confirmed employee deletion flows with complete loading, empty, error, and disabled states.
- [x] 8.5 Add Web component and browser coverage for independent instances, active expert work, permission differences, upgrade approval, redacted exports, and destructive cleanup.

## 9. Session and SDK Projections

- [x] 9.1 Add required-on-read Session event declarations and projections for employee identity, instruction revision, memory projection, expert delegation, expert result delivery, and memory promotion decisions.
- [x] 9.2 Update TypeScript SDK protocol types, projections, fixtures, and expected outputs for the new lifecycle and Session events.
- [x] 9.3 Update Python SDK models, projections, fixtures, and expected outputs in lockstep with the TypeScript SDK.
- [x] 9.4 Add restoration and forward-compatibility tests for the new events, including ignorable handling where explicitly permitted.

## 10. Bundles, Examples, and Documentation

- [x] 10.1 Compose the Definition, file Provider, Consumers, and example template into a selected runnable bundle without adding employee-specific logic to `agent-loop`.
- [x] 10.2 Extend the snapshot harness and keyless example to demonstrate employee creation, resolved identity, expert delegation, memory promotion decision, capability denial, lifecycle transition, and final result.
- [x] 10.3 Update affected package READMEs, architecture and testing documentation, Web documentation projection, and public JSDoc for employee configuration and operational behavior.
- [x] 10.4 Add a non-trivial Agent Note documenting the durable template/instance split, explicit authority inheritance, existing-runtime expert composition, and model-visible event obligations.

## 11. Verification

- [x] 11.1 Run focused package tests for Definition, Provider, memory, expert delegation, Host/API Remote, Web, Session, and both SDK projections.
- [x] 11.2 Run the digital employee keyless snapshot test and verify the assembled transcript covers every required user-visible acceptance path.
- [x] 11.3 Run the smallest applicable typecheck, build, lint, hygiene, documentation sync, and website build gates for the changed packages and projections.
- [x] 11.4 Run `openspec validate add-digital-employee-platform --strict` and resolve every proposal validation error before implementation is considered ready.
