# Agent Note: Marketplace workflow and subagent packages for digital employees

Status: implemented

English | [中文](2026-09-05-marketplace-employee-workflows-subagents.zh.md)

## Problem

Workflows and subagents were host-configured code plugins only. Digital employees could not acquire orchestration scripts or child personas from the marketplace, and template authors had no way to bind them.

## Decision

`workflow` and `subagent` become the fourth and fifth marketplace package kinds. Workflow entries declare engine scripts pinned to the signed file table; subagent entries declare child personas (instructions file, tool allowlist, delegation policy) that never ship provider code — the in-process spawn driver is the fixed execution backend. Employee templates reference both kinds by id; composition resolves references and fails task start on unresolved ids. Mounted assets register `workflow__<id>` tools and `subagent__<id>` providers scoped to the binding employee's composition only.

## Alternatives considered

- **Inline market assets inside the employee package** — duplicates six market formats and breaks asset version independence.
- **Global asset mounting** — collides with instance scoping; host-wide assets remain a cordis.yml concern.

## Consequences

Subagent personas widen who can spawn children, but the spawn driver's tool filter and delegation policy enforcement bound the risk. Workflow scripts run in worker threads (isolation, not security). The kind-widening is compile-time breaking only inside the repo.
