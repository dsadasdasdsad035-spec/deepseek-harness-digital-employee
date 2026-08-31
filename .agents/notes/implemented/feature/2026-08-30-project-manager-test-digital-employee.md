# Agent Note: Project-manager test digital employee

Status: implemented

English | [中文](2026-08-30-project-manager-test-digital-employee.zh.md)

## Problem

The minimal digital employee example cannot prove that an employee's declared skills, tools, MCP client, instructions, and long-term memory compose together through the production Agent path. A reference test needs all of those capability kinds without a model credential, network service, or production project-management provider.

## Decision

`@deepseek-ai/dsh-project-manager-test-digital-employee` provides the offline `project-manager-test` template. It retains `1.0.0` for existing employees and publishes `1.1.0` for new employees. The newer revision materializes one non-sensitive Atlas long-term memory record in the same durable update that creates its employee, with package-owned provenance.

The root Project Manager owns static Atlas skills, project-board and project-document tools, a stdio project-data MCP server, and project-manager instructions. It can delegate one review to the package-owned Risk Reviewer. That expert has only the risk-review skill, project evidence tools, project-data MCP access, and long-term memory access; its zero additional-depth budget, empty expert list, and disabled generic subagents prevent descendant delegation.

The assembled headless fixture creates an employee through the Host management gateway and records template listing, initialized memory, expert discovery, delegated risk review, scoped expert MCP use, rejected descendant delegation, and the durable root result. The Web development bundle registers the template, skills, tools, and MCP manager so the digital employee management workspace can create and activate a `Project Manager (Test)` instance.

Each MCP client instance name is derived from the employee, Agent Session, and MCP declaration. Root employee sessions and expert child sessions can therefore mount the same declared MCP server concurrently.

## Alternatives considered

- **Mock every result inside one test**: this would not prove that the template's package-owned declarations resolve and mount on an employee Agent.
- **Add the full capability set to the minimal example template**: this would remove the capability-free baseline used to isolate generic composition behavior.
- **Use a production project-management service**: this would introduce credentials, network variability, and external data into keyless coverage.

## Consequences

Digital employee composition has a deterministic reference package that exercises template-backed memory initialization and bounded expert delegation through normal runtime wiring and is discoverable in the Web development management workspace. Concurrent root and expert sessions receive separate MCP client instances while retaining the same employee authorization. The fixture remains intentionally narrow: it uses fixed Atlas data, grants one least-privilege Risk Reviewer, grants no generic subagents, and does not represent a production project-management integration.
