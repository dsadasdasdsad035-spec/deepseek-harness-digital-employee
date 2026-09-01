## Why

The marketplace exposes Skill, Tool, and MCP package workflows, but only the Skill example is directly installable and current browser coverage does not prove that all three installed asset kinds can reach a published digital employee and its `@`-started chat runtime. Administrators need one reproducible, keyless reference workflow that distinguishes installation, restart-bound activation, template authorization, and model-visible use.

## What Changes

- Add safe downloadable test examples for Skill, Tool, and MCP packages; each example is accepted by its marketplace in the intended development/test trust configuration.
- Keep executable Tool publisher trust explicit and test-only rather than embedding a production-trusted demo key.
- Add a local Streamable HTTP MCP fixture and credential-reference configuration suitable for offline assembled and Web tests.
- Extend the marketplace Web workflow to install all three examples, preserve their managed state across a Host restart, and report activation/configuration status.
- Extend Template configuration coverage so an administrator can select the activated test Skill, Tool, and MCP server, validate and publish the draft, and create an active employee from it.
- Add a deterministic employee conversation proving that `@` startup publishes and loads the authorized Skill, invokes the authorized Tool and MCP Tool, and excludes undeclared marketplace capabilities.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `skill-market-zip-template`: The downloadable Skill example remains directly installable and participates in the full digital employee reference workflow.
- `tool-marketplace`: The marketplace provides a reviewed, signed development/test Tool example and proves restart-bound activation before template selection.
- `mcp-marketplace`: The marketplace provides a reviewed declarative MCP example, credential-reference setup, and offline restart-bound activation.
- `marketplace-template-catalog`: Activated example assets from all three marketplaces are projected with provenance and availability into Template configuration.
- `digital-employee-configuration-studio`: An administrator can publish a template selecting the three installed example capabilities and create an employee from it.
- `digital-employee-capabilities`: The resulting employee receives only the selected marketplace Skill, Tool, and MCP client and can invoke each through its normal runtime.
- `digital-employee-chat-mentions`: An `@`-started employee conversation exercises the selected marketplace capabilities through the production task-start path.

## Impact

The change affects marketplace template assets and generation, local publisher trust fixtures, Tool and MCP example packages, the Web marketplace E2E scaffold, Template configuration asset and publication coverage, digital employee assembled snapshots, and `@` chat Web E2E. Production marketplace trust defaults and credential-value handling remain unchanged.
