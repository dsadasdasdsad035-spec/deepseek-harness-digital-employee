# @deepseek-ai/dsh-project-manager-test-digital-employee

English | [中文](README.zh.md)

Offline deterministic reference package for the `project-manager-test` digital employee. The Web development bundle registers it for manual digital-employee management testing; its project board, document, MCP server, skills, and memory seed remain static Atlas fixture data.

The template grants exactly three skills, two local tools, and one stdio MCP client. It has no experts or generic subagent permission. `AGENTS.md` requires evidence from those declared capabilities before it reports delivery status.

The package does not call a model, network service, credential provider, or production project-management API.

## Model Experience

### Project Manager context

#### What the model sees

The employee Consumer renders the package-owned `AGENTS.md`, project-manager personality, Atlas seed-memory projection, three skills, two local tools, and one scoped project-data MCP tool into the logged employee context.

#### Token effect

The static project-manager instructions, skill files, and bounded Atlas memory add deterministic prompt content. Tool and MCP schemas become visible only for the template's declared capabilities.

#### KV Cache effect

The employee template version, fixed instruction assets, and bounded memory projection determine the reusable prompt prefix. A different memory query or accepted durable decision changes the relevant turn context.

## Known Limitations and Deferred Work

- **Test-only fixture data** - Atlas milestones, ownership, risks, project board, and document responses are static and do not represent a production project-management provider.
- **Fixed capability set** - the package declares one employee revision and intentionally does not grant experts or generic subagent delegation.
