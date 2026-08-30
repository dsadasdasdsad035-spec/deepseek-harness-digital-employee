# Agent Note: Digital employee chats use structured routing and atomic startup

Status: implemented

English | [中文](2026-08-29-digital-employee-chat-routing.zh.md)

## Problem

A chat entry must select a durable digital employee before the root Session exists. Parsing display text cannot preserve stable ownership, and creating the Session before accepting the first message exposes empty employee work when validation or admission fails. Starting work from employee management also needs to converge with direct chat selection without replacing an unrelated draft or creating a different task path.

## Decision

The new-task composer represents employee selection as one structured routing reference carrying the stable employee instance ID. The reference is valid only at the leading semantic position, only one routing owner may exist, and its label never enters model-visible content. The generic input system owns editing, invalidation, undo, retry settlement, and routing-claim arbitration; the digital employee client owns discovery, availability display, employee validation hints, and submission.

The client sends the remaining text and images through `digitalEmployees.startChat` with caller-generated Session and submission identities. The Host repeats authoritative employee and template validation, resolves the composition described by the [digital employee composition decision](2026-08-28-digital-employee-composition.md), creates the root Agent, admits attachments, and queues the standard first user message as one operation. Identical retries share the accepted result. Reusing a submission identity with different task data rejects, and any validation, cancellation, attachment, or message-admission failure disposes unpublished work instead of returning a usable empty employee Session.

The browser clears the submitted composer and selects the returned Session only after Host acceptance. A failed or aborted startup retains the routing reference, task text, and attachments. The management workspace exposes **Start chat**, which opens a distinct new-task composer with the employee preselected; no Host employee Session exists until the user supplies task content and submits.

## Durable ownership

Before publication, the root Session records the required `digital-employee/identity` event with the employee instance ID, template ID and version, and resolved composition ID, plus creation-time presentation data. The first task content remains an ordinary `user/message` event. Restoration therefore reads ownership from durable identity rather than current display text, and later rename, upgrade, deactivation, or removal does not rewrite historical ownership. Expert and subagent work remains attributable to that employee-owned root Session and its effective authority.

## Alternatives considered

- **Parse plain-text `@name` on the Host**: names can change or collide, and text cannot carry a stable instance identity or participate in composer invalidation.
- **Create the employee Session, then send the first message through a second operation**: partial failure exposes an empty employee-owned Session and splits submission idempotency across two calls.
- **Create an empty employee Session from the management workspace**: opening management becomes a durable mutation before the user has supplied work and follows a different failure path from direct chat selection.
- **Allow employee mentions inside existing conversations or select several employees**: ownership, memory, permissions, and audit attribution would require an orchestration model rather than one root task owner.

## Consequences

The generic composer gains a plugin-owned routing submission mechanism without importing the digital employee domain. Picker availability is an affordance, while the Host remains authoritative at submission time. Accepted startup publishes one attributable root Session with its first message; rejected startup preserves the user's source state and leaves no usable empty employee Session. Management and direct `@` entry share one validation, admission, retry, and navigation path.
