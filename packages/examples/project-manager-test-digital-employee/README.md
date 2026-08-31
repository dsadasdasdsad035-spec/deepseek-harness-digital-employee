# @deepseek-ai/dsh-project-manager-test-digital-employee

English | [中文](README.zh.md)

Offline deterministic reference package for the `project-manager-test` digital employee. The Web development bundle registers it for manual digital-employee management testing; its project board, document, MCP server, skills, and Atlas memory remain static fixture data.

The package keeps `1.0.0` registered for existing employees and publishes `1.1.0` for new employees. Creation from `1.1.0` atomically writes one non-sensitive Atlas long-term memory record with package-owned provenance. Existing employees do not receive a backfill.

The root Project Manager grants exactly three skills, two local tools, and one stdio MCP client. It may delegate one review to the `risk-reviewer` expert, which has only the `risk-review` skill, the project evidence tools, the `project-data` MCP client, and long-term memory access. The expert cannot delegate to another expert or subagent. `AGENTS.md` requires evidence from declared capabilities before it reports delivery status.

The package does not call a model, network service, credential provider, or production project-management API.

## Model Experience

### Project Manager context

#### What the model sees

The employee Consumer renders the package-owned `AGENTS.md`, project-manager personality, initialized Atlas memory projection, three skills, two local tools, and one scoped project-data MCP tool into the logged root context. A Risk Reviewer child receives only its declared instruction, risk-review skill, project evidence tools, project-data MCP client, and long-term memory projection.

#### Token effect

The static project-manager instructions, skill files, and bounded Atlas memory add deterministic prompt content. Root and expert tool and MCP schemas become visible only for their respective declared capabilities.

#### KV Cache effect

The employee template version, fixed instruction assets, and bounded memory projection determine the reusable prompt prefix. A different memory query, accepted durable decision, or delegated Risk Reviewer turn changes the relevant context.

## Known Limitations and Deferred Work

- **Test-only fixture data** - Atlas milestones, ownership, risks, project board, and document responses are static and do not represent a production project-management provider.
- **Fixed capability set** - `1.1.0` exposes one bounded Risk Reviewer and no generic subagent delegation. It does not provide editable memory seeds, expert definitions, or production project-management access.
