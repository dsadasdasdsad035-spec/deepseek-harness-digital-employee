# `@deepseek-ai/dsh-digital-employee-agent`

English | [中文](README.zh.md)

Consumer that composes a resolved digital employee into an unpublished Agent scope. It mounts the template's exact preset and registers scoped identity, personality, instance override, and versioned `AGENTS.md` prompt sections before Agent publication.

## Task Creation

`DigitalEmployeeAgent.createTask()` resolves an active employee before asking the Agent registry to create the root Session. Resolution failures therefore leave no Session behind. The created Agent uses the resolved template preset even when caller metadata names another preset, and callers retain the returned handle until the task has been admitted or abandoned. When the caller supplies a complete model selection, setup installs it for prompt variables and request routing while preserving optional loop settings such as `maxTokens`.

Unpublished Agent setup records `digital-employee/identity` with the employee instance, template ID and version, deterministic composition ID, display name, and personality, then records `digital-employee/instructions` with the instruction revision. Both events are required on read because they establish durable ownership and reconstruct model-visible employee input.

When `createTask()` receives a memory query, it resolves a bounded employee-owned projection before Session creation. Setup records `digital-employee/memory-projection` with each visible memory ID, scope, rendered content, and provenance, then renders the prompt section from that same event payload. `resumeTask()` accepts the same optional query and appends a fresh projection to the restored session before its next turn, so cold-resumed sessions see current memory.

Every employee Agent scope mounts the `employee_memory` tool: `save` submits a long-term candidate through controlled promotion with session provenance, and `search` returns a bounded result of the employee's own records. Policy rejections (duplicate content, disabled sensitivity, excessive retention) return to the model as the tool result, and every decision is recorded on the session log as `digital-employee/memory-decision`. The tool is a scope-local registration, so it stays model-visible past business-tool restriction by the tools registry's contract.

Named experts use the existing subagent runtime. Delegation records request, denial, child identity, and result events; continuable experts remain addressable through their parent task. Effective expert authority is the intersection of the expert declaration, employee grants, and parent Agent authority, while depth, concurrency, and timeout limits may only tighten.

When an employee has authorized experts and a subagent provider is available, its Agent scope exposes `delegate_to_expert`. The model must provide the exact expert id and a non-empty prompt; the tool selects the configured provider and returns the one-shot result or continuable child identity. Provider absence remains an explicit runtime diagnostic, and the tool never grants capabilities outside the resolved employee authority.

MCP server and skill references are resolved from the employee's explicit authority. Missing references fail task creation instead of exposing ambient registrations.

Authorized skills must reach the model, not just the registry. The employee composition restricts tools to its declared business tools but always keeps the skill seam's loader tool (`skill`) visible past that restriction, because the seam publishes the loader and the model-visible session skill catalog together and suppresses both when the loader is masked. An employee that declares skills but runs on a preset without the loader fails composition with a diagnostic naming the missing plugin, instead of composing an employee whose skills the model cannot see.

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


Every employee composition also writes capability attribution to the employee's durable audit log. The acting Agent is read from the composition scope as the property agent-loop exposes (`extend({ agent })`), never as a provided service; a scope that exposes none fails composition rather than silently skipping the audit. This attribution is what lets the console map an employee's running sessions — including its company-group member session — back to the employee, so an employee working in chat reads as busy at its desk.
