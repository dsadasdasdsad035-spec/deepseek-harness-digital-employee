## 1. Contracts And Core Delegation

- [x] 1.1 Define the model-facing expert delegation request, result, error, and Session event contracts.
- [x] 1.2 Implement the scoped expert delegation tool and route calls through the existing digital employee expert resolver.
- [x] 1.3 Enforce prompt validation, expert authorization, provider availability, and parent/employee/expert capability intersection before child publication.
- [x] 1.4 Ensure expert child composition loads instructions, persona, skills, tools, MCP clients, memory context, and model settings through the existing composition path.

## 2. Ordinary Subagent And Web Composition

- [x] 2.1 Audit the generic `tool-subagent` and `tool-subagent-fork` registration contracts for per-Agent scope and policy filtering.
- [x] 2.2 Add explicit Web preset configuration for authorized ordinary subagent modes without re-registering the Host-plane subagent registry.
- [x] 2.3 Apply max depth, concurrency, timeout, background, continuation, and nested delegation limits to expert and ordinary subagent calls.
- [x] 2.4 Verify delegation tool names and schemas do not conflict with existing namespaces or mounted marketplace tools.

## 3. Host, Session, And Observability

- [x] 3.1 Extend Host digital employee composition and RPC projections for delegated child identity, mode, status, and continuation where required.
- [x] 3.2 Persist request, denial, child creation, completion, and diagnostic events in the parent Session with secret-free payloads.
- [x] 3.3 Attribute child skill, tool, MCP, memory, and delegation activity to the employee instance, expert identity, Session, and Agent.
- [x] 3.4 Ensure rejected or failed admissions dispose unpublished work and leave no orphan child Session.

## 4. Verification

- [x] 4.1 Add Core unit tests for authorized expert delegation, capability intersection, policy limits, provider failures, and nested delegation.
- [x] 4.2 Add Host and tool tests for model schemas, Session events, lifecycle cleanup, and Web preset composition.
- [x] 4.3 Add a keyless assembled snapshot covering a Web digital employee that delegates to an expert and receives the result.
- [x] 4.4 Add Web E2E coverage for `@数字员工`, expert delegation, ordinary subagent policy behavior, child listing, and continuation.
- [x] 4.5 Run focused tests, typecheck, build, OpenSpec strict validation, and relevant documentation checks.

## 5. Documentation

- [x] 5.1 Document how template authors authorize experts and ordinary subagents, including limits and capability inheritance.
- [x] 5.2 Document the end-user chat behavior and child-session lifecycle in English and Chinese.
- [x] 5.3 Add an Agent Note for the model-visible delegation architecture and its security invariants.
