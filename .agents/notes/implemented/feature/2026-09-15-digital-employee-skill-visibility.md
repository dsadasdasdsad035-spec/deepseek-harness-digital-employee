# Agent Note: Digital employee skills reach the model

Status: implemented

English | [中文](2026-09-15-digital-employee-skill-visibility.zh.md)

## Problem

A digital employee template declares `capabilities.skills`, and the employee composition restricts the skill registry to that set, but the model never received the list. Skills reach a model only through the skill seam's catalog, which is published by the `tool-skill` consumer and gated on the calling agent resolving that consumer's own loader tool: the consumer reads `ctx.tools.get('skill', agent) === skillTool`, and only then snapshots the skills; otherwise it publishes an empty catalog.

The employee composition then restricts tools to its declared business tools, and `skill` is not among them, so that check failed and the catalog stayed empty. Live tests made the consequence concrete: an instance declaring manga skills introduced itself as a project manager and recited PMP/WBS capabilities, because the "skills" it reported were hallucinated from its instruction text rather than read from a catalog. A second cause compounded it: some employee presets (e.g. `project-manager-test`) mounted skill definitions but not the catalog/loader consumer, so those employees had no catalog even without a restriction.

Tools, by contrast, were genuinely isolated (one employee called `project_board` for real data; another answered "I don't have that tool"), which is what made the skills gap stand out.

## Decision

- **Keep the skill loader visible past the business-tool restriction.** The employee composition now always adds the seam's loader tool name to the tool allowlist for any employee that declares skills. The seam owns the name (`SKILL_LOADER_TOOL_NAME`), so no consumer hardcodes `skill`; the catalog is already correct once the loader is visible, because `skills.restrict({ allow: authority.skills })` decides its content.
- **Fail loud on a skill-declaring preset without a loader.** Resolving the loader through the agent's tool view means an employee whose preset omits the consumer fails composition with a diagnostic naming the missing plugin, rather than composing an employee whose skills the model cannot see.
- **Do not touch the seam's visibility gate, and do not render skills into the system prompt.** Keeping the gate makes the catalog and loader co-extensive (no "listed but un-loadable" list, no leaked names when the loader is deliberately denied). Rendering skills as a prompt section would duplicate the catalog's projection and lose on-demand loading. Both alternatives were rejected.
- The expert composition applies the same loader-preservation, so delegated experts with authorized skills also see their catalog.

## Alternatives considered

- **Render `authority.skills` as a system-prompt section** (like identity/personality) — duplicates the catalog logic, loses on-demand loading of skill bodies, and adds a second place to sync on skill edits.
- **Make the catalog independent of loader visibility** — breaks the seam's existing contract that listing and loading are published together, and risks leaking skill names when the loader is deliberately denied.
- **Tolerate a skill-declaring preset without a loader** — this is exactly the silent failure being fixed.

## Consequences

Verified end to end. The keyless assembled snapshot (`project-manager-digital-employee`) now asserts a durable `skill-catalog` message whose entries equal the employee's authorized skills, and its `visibleTools` gained `skill`; the registry/catalog assertions run through `createTask`, the same path single chat and group members use. Package tests cover: loader preserved past the restriction, composition failing without it, and no loader added when no skills are declared. Against the real service, the group member session's `skill-catalog` message contained exactly `project-planning, risk-review, status-reporting` (the authorized set) and the employee answered with exactly those names, no longer influenced by its instruction text alone.

A data-level finding remains and is not fixed here: an instance whose template instructions say "project manager" but whose declared skills are manga/video reports the instruction role, because the model weights its instructions over the catalog when they conflict. That is dirty fixture data (mismatched template/instance), not a code defect; aligning such instances is operator work.

## Problem space left open

- Whether a skill-declaring preset should be validated when the preset is authored/mounted rather than only at first employee composition — a mount-time check would fail earlier.
- The dirty-data mismatch above suggests a future validation that warns when a template's declared skills and its instruction text disagree.
