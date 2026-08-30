# Agent Note: Project-manager test digital employee

Status: implemented

English | [中文](2026-08-30-project-manager-test-digital-employee.zh.md)

## Problem

The minimal digital employee example cannot prove that an employee's declared skills, tools, MCP client, instructions, and long-term memory compose together through the production Agent path. A reference test needs all of those capability kinds without a model credential, network service, or production project-management provider.

## Decision

`@deepseek-ai/dsh-project-manager-test-digital-employee` provides the offline `project-manager-test` template. The template owns static Atlas skills, project-board and project-document tools, a stdio project-data MCP server, project-manager instructions, and bounded seed memory.

The assembled headless fixture starts an isolated employee through the existing digital employee Consumer. Its deterministic transcript records the resolved capability list, memory projection, tool and MCP use, and a durable project-decision result.

The Web development bundle registers the template, skills, tools, and MCP manager so the digital employee management workspace can create and activate a `Project Manager (Test)` instance for manual verification.

## Alternatives considered

- **Mock every result inside one test**: this would not prove that the template's package-owned declarations resolve and mount on an employee Agent.
- **Add the full capability set to the minimal example template**: this would remove the capability-free baseline used to isolate generic composition behavior.
- **Use a production project-management service**: this would introduce credentials, network variability, and external data into keyless coverage.

## Consequences

Digital employee composition has a deterministic reference package that exercises every declared capability kind through normal runtime wiring and is discoverable in the Web development management workspace. The fixture remains intentionally narrow: it uses fixed Atlas data, grants no experts or generic subagents, and does not represent a production project-management integration.
