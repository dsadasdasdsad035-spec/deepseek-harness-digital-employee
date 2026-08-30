# @deepseek-ai/dsh-digital-employee-example-template

English | [中文](README.zh.md)

Shipped example template for an Operations Coordinator digital employee. The plugin registers immutable versions `1.0.0` and `2.0.0` on `ctx.digitalEmployees` for its own Cordis effect lifetime.

Both versions use the `standard` preset, package-owned `AGENTS.md` instructions, and a continuable Independent Reviewer expert with package-owned instructions. Version `1.0.0` grants only that expert; version `2.0.0` revises the coordinator instructions and also permits generic subagents, providing a concrete upgrade-preview and grant-review path.

The template declares no skills, tools, or MCP servers. Its reviewer has no capabilities, accepts task and Session memory, permits no deeper delegation, runs at most one child, and has a 30-second timeout.

## Model Experience

### Operations Coordinator context

#### What the model sees

The employee Consumer renders the selected version's package-owned `AGENTS.md`, coordinator personality, and Independent Reviewer instructions into logged employee and expert context.

#### Token effect

The selected coordinator and reviewer instruction files add stable prompt content; version `2.0.0` may also expose generic subagent schemas when instance and parent authority permit them.

#### KV Cache effect

The prefix changes when an instance upgrades between the two template versions or changes its personality and grants.

## Known Limitations and Deferred Work

- **Demonstration authority only** - the template intentionally declares no tools, skills, or MCP servers, so deployments must publish another template to demonstrate those capability kinds.
- **Fixed example revisions** - instruction text and the two version identifiers are package assets, not runtime configuration.
