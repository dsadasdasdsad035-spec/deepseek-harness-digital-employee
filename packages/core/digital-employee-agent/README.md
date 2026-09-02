# `@deepseek-ai/dsh-digital-employee-agent`

English | [中文](README.zh.md)

Consumer that composes a resolved digital employee into an unpublished Agent scope. It mounts the template's exact preset and registers scoped identity, personality, instance override, and versioned `AGENTS.md` prompt sections before Agent publication.

## Task Creation

`DigitalEmployeeAgent.createTask()` resolves an active employee before asking the Agent registry to create the root Session. Resolution failures therefore leave no Session behind. The created Agent uses the resolved template preset even when caller metadata names another preset, and callers retain the returned handle until the task has been admitted or abandoned. When the caller supplies a complete model selection, setup installs it for prompt variables and request routing while preserving optional loop settings such as `maxTokens`.

Unpublished Agent setup records `digital-employee/identity` with the employee instance, template ID and version, deterministic composition ID, display name, and personality, then records `digital-employee/instructions` with the instruction revision. Both events are required on read because they establish durable ownership and reconstruct model-visible employee input.

When `createTask()` receives a memory query, it resolves a bounded employee-owned projection before Session creation. Setup records `digital-employee/memory-projection` with each visible memory ID, scope, rendered content, and provenance, then renders the prompt section from that same event payload.

Named experts use the existing subagent runtime. Delegation records request, denial, child identity, and result events; continuable experts remain addressable through their parent task. Effective expert authority is the intersection of the expert declaration, employee grants, and parent Agent authority, while depth, concurrency, and timeout limits may only tighten.

When an employee has authorized experts and a subagent provider is available, its Agent scope exposes `delegate_to_expert`. The model must provide the exact expert id and a non-empty prompt; the tool selects the configured provider and returns the one-shot result or continuable child identity. Provider absence remains an explicit runtime diagnostic, and the tool never grants capabilities outside the resolved employee authority.

MCP server and skill references are resolved from the employee's explicit authority. Missing references fail task creation instead of exposing ambient registrations.

The keyless Loader fixture at `examples/headless-agent/tests/fixtures/core/digital-employee-agent/` registers a trusted template, creates and activates an instance, and runs one root task through the existing Agent loop.

## Model Experience

### Employee request context

#### What the model sees

Every request sees the logged employee identity, template and instance personality, versioned instructions, selected memory projection, and completed expert results from `digital-employee/*` events. Tool schemas include only skills, tools, and MCP servers present in the resolved authority.

#### Token effect

Prompt usage grows with the selected instruction file, short identity metadata, bounded memory projection, and rendered expert results.

#### KV Cache effect

The prefix remains stable while employee identity, personality override, template version, instruction revision, authority, and projected memory remain unchanged.

## Known Limitations and Deferred Work

- **No employee-specific scheduler** - tasks and experts depend on the mounted Agent and subagent runtimes; this package does not provide an independent execution engine.
