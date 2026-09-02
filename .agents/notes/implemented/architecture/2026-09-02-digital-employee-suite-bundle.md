# Agent Note: Digital employee capabilities ship as an extension bundle

Status: implemented

English | [中文](2026-09-02-digital-employee-suite-bundle.zh.md)

## Problem

Digital employee management and its browser workspace are spread across existing Host and Client packages, while marketplace and API remote ownership already belongs to the Web bundle. A separately installable digital employee package must reuse those owners without registering duplicate remote namespaces or storing configuration in the bundle author's home.

## Decision

The repository ships `@deepseek-ai/dsh-digital-employee-suite` as an optional extension over `@deepseek-ai/dsh-base` and `@deepseek-ai/dsh-web-app`. Its patch owns digital employee definition, persistence, agent integration, management, and browser workspace rows. The Web bundle remains the owner of `api-remotes`, Skill/Tool/MCP marketplace rows, and their settings UI.

All suite-owned durable paths are expressed with `dshHomePath(...)`: employee records use `digital-employees/employees.json`, and Template configuration drafts and publications use `digital-employees/configuration-studio.json`. The package carries no source-machine data, absolute paths, or resolved credential values.

## Alternatives considered

- **Copy the Web bundle's marketplace and remote rows into the suite:** Rejected because loading both packages would register duplicate namespaces, including the previously observed `skillMarket/install` conflict.
- **Leave the management Host's default studio path unchanged:** Rejected because that default points at a developer-specific legacy home and would violate target-project data isolation.
- **Create a monolithic digital employee runtime package:** Rejected because existing capability seams already own lifecycle, generated remotes, and browser contributions; copying them would create competing registries and increase upgrade risk.

## Consequences

Consumers must install the suite alongside the base and Web bundles, and marketplace inventory remains available through the Web-owned composition. Removing or upgrading the suite leaves target `$DSH_HOME` data untouched. Composition tests pin the ownership split and target-local Skill, Tool, MCP, employee, and Template configuration paths.
