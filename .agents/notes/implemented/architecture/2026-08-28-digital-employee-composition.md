# Agent Note: Digital employee composition uses durable instances and existing agent runtimes

Status: implemented

English | [中文](2026-08-28-digital-employee-composition.zh.md)

## Problem

A digital employee combines reusable instructions with mutable identity, grants, memory, lifecycle, and expert work. Treating that combination as one mutable object would make template updates rewrite employee history, while a separate employee execution engine would duplicate Agent and subagent scheduling, continuation, cancellation, and persistence. Authority and model-visible state also need rules that remain valid when presets, MCP servers, skills, and experts are composed from independently registered plugins.

## Decision

Digital employee templates are immutable executable definitions identified by template ID and exact version. Durable instances hold independent identity, display name, personality override, grants, lifecycle state, memory, and audit history while retaining the pinned template version. Registering a new template version does not mutate an instance; upgrade is an explicit preview-and-apply operation that reviews capability changes and grants.

The Agent Consumer resolves an active instance before Session creation and composes it through the existing Agent preset, scoped-registration, and subagent runtimes. Named experts are descriptors for existing subagent execution, including continuable children; they do not introduce an employee scheduler, child protocol, or agent-loop branch.

## Authority

Authority is explicit and monotonic. A root employee receives only capabilities declared by its template and granted by its instance. An expert receives the intersection of its declaration, the employee's effective authority, and the parent Agent's authority. Delegation depth, concurrency, and timeout limits can only tighten as work descends. Missing skill or MCP references fail resolution rather than falling back to ambient registrations.

## Durable model input

Every employee-specific value that can reach a model request is reconstructed from Session events. Identity, versioned instructions, bounded memory projection, expert request, denial, child identity, result, and memory decision events carry the payload used for prompt or history rendering. Audit records support management accountability but do not replace the Session log for model replay.

## Alternatives considered

- **Copy templates and executable configuration into every instance**: this duplicates definitions, obscures which version executed, and turns template correction into mutable instance migration.
- **Build a separate employee and expert runtime**: this duplicates Agent publication, lifecycle, continuation, cancellation, persistence, and subagent semantics while creating another path around agent-loop extensions.
- **Union inherited and ambient authority**: this lets presets or globally mounted capabilities exceed reviewed employee and parent grants.
- **Keep employee context only in prompts or audit records**: neither source reconstructs the exact model input during Session replay.

## Consequences

Template authors publish new immutable versions; operators explicitly upgrade instances. Providers own mutable persistence and policy, while Consumers own Agent composition and Session projections. Host and Web management remain adapters over those services. Tests cover registry disposal, provider durability and lifecycle, authority intersections, assembled model-visible events, SDK projections, and browser management journeys without a second execution stack.
