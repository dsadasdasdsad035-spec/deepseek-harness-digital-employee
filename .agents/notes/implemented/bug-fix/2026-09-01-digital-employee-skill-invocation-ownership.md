# Agent Note: Digital employee Skill invocation ownership

Status: implemented

English | [中文](2026-09-01-digital-employee-skill-invocation-ownership.zh.md)

## Problem

Digital employee composition restricted Skills and Tools independently, but the model-facing Skill catalog depended on a Tool named `skill`. A business Tool allowlist that omitted that infrastructure Tool retained authorized Skill definitions while hiding both their catalog and loader. Template validation only checked Skill summaries, so it could publish a reference whose body did not load.

## Decision

A Skill-enabled digital employee mounts `dsh-tool-skill` in the exact employee Agent scope after inherited business Tool restrictions. Tool restrictions continue to filter inherited business capabilities, while the employee-owned loader remains visible under the Tool registry's existing own-layer rule. The Skill restriction remains authoritative for catalog entries and loaded definitions.

Template configuration keeps `skill` out of persisted Tool grants and marketplace selection. Validation resolves each authorized Skill body through the selected preset's standing scope; a listed Skill with no loadable definition produces an `unloadable-skill` diagnostic.

The assembled project-manager fixture calls the real loader and records both its returned instructions and `skill/selected` attribution. Registry listing alone is not acceptance evidence for model-visible Skill behavior.

## Alternatives considered

**Add `skill` to every employee Tool grant.** Rejected because administrators authorize business Tools, not infrastructure required to realize a separate Skill authorization.

**Exempt the name globally in ToolRegistry restrictions.** Rejected because the registry cannot distinguish the trusted loader from an unrelated scoped Tool with the same name, and the exception would affect every Agent type.

**Rely on presets to mount the loader.** Rejected because preset contributions are inherited by the employee Agent and remain subject to its later Tool restriction.

## Consequences

Existing template and employee records require no migration. Skill-enabled employees expose one additional model-facing infrastructure schema, while employees without Skills do not mount it. Validation performs definition loading for authorized Skills, increasing validation work in exchange for rejecting runtime-only failures before publication.
