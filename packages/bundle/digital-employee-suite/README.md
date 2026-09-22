# `@deepseek-ai/dsh-digital-employee-suite`

English | [中文](README.zh.md)

An installable profile bundle layer that owns the three business domains over a Web surface: the Skill/Tool/MCP/Hook/Workflow/Subagent marketplaces, the digital employee runtime with management and Template configuration, and the company module with the 3D campus console and group chat. Apply it over `@deepseek-ai/dsh-base` and `@deepseek-ai/dsh-web-app`; the shipped web profile template already stacks it, so a normal `dsh web` deployment has every capability.

Install it into any other profile with `dsh plugin --profile <name> add @deepseek-ai/dsh-digital-employee-suite`, or add the package to the profile and include it after `@deepseek-ai/dsh-web-app` in `dsh.profile.bundles`. The bundle owns every domain Host row and its browser rows (`ui-skill-market`, `ui-digital-employees`, `ui-companies`); `dsh-web-app` stays the owner of the shared `api-remotes` carrier those domains' remotes travel over, and loading both never duplicates a namespace.

All employee records, company stores, and marketplace installations are target-local. The bundle contains no user employees, companies, templates, marketplace archives, absolute development paths, or resolved credential values. Removing or upgrading the bundle does not remove files under `$DSH_HOME`.

## Model Experience

### Digital employee context

#### What the model sees

When a user starts a chat with a managed digital employee (`@数字员工` input source or the management page), the composed Host resolves that employee's published template, instructions, declared Skills, Tools, MCP servers, experts, and memory projection, then appends the durable `digital-employee/identity` event recording the resolved composition. The suite owns the marketplace, employee, and company contributions; the Web bundle supplies the shared API carrier.

#### Token effect

The employee's instruction file, selected capability descriptions, and permitted memory records are added only to that employee session. Marketplace packages that are installed but inactive are not exposed as usable capabilities.

#### KV Cache effect

The published template version and stable instruction assets form the reusable prompt prefix. Changes to the employee's selected capabilities or memory projection affect later session context.

## Known Limitations and Deferred Work

- **Web bundle prerequisite** - the suite's remotes travel over the `api-remotes` carrier and browser roster the Web bundle mounts; the consuming profile must provide `@deepseek-ai/dsh-web-app`.
- **Restart activation** - newly installed Tool and MCP packages become selectable only after their normal Host activation and restart checks succeed.
- **Target-local configuration** - employee records, company stores, Template configuration drafts, and marketplace installations are intentionally not migrated from the bundle author's machine.
