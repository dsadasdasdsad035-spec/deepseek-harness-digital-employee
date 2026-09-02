# `@deepseek-ai/dsh-digital-employee-suite`

English | [中文](README.zh.md)

An optional profile bundle extension for the Web surface. It adds digital employee operations, Template configuration, example templates, durable employee persistence, and the `@数字员工` input source to a profile that already contains `@deepseek-ai/dsh-base` and `@deepseek-ai/dsh-web-app`.

Install it in a consuming profile with `dsh plugin --profile <name> add @deepseek-ai/dsh-digital-employee-suite`, or add the package to the profile and include it after `@deepseek-ai/dsh-web-app` in `dsh.profile.bundles`. The bundle deliberately does not duplicate `api-remotes`, Skill/Tool/MCP marketplace rows, or their settings UI; those rows remain owned by `dsh-web-app`.

All employee records and template configuration are target-local. The bundle contains no user employees, templates, marketplace archives, absolute development paths, or resolved credential values. Removing or upgrading the bundle does not remove files under `$DSH_HOME`.

## Model Experience

### Digital employee context

#### What the model sees

When a user starts a chat with a managed digital employee, the composed Host resolves that employee's published template, instructions, declared Skills, Tools, MCP servers, experts, and memory projection. The suite adds the management and chat entry points; the Web bundle supplies the shared marketplace and API remote composition.

#### Token effect

The employee's instruction file, selected capability descriptions, and permitted memory records are added only to that employee session. Marketplace packages that are installed but inactive are not exposed as usable capabilities.

#### KV Cache effect

The published template version and stable instruction assets form the reusable prompt prefix. Changes to the employee's selected capabilities or memory projection affect later session context.

## Known Limitations and Deferred Work

- **Web bundle prerequisite** - this extension does not duplicate the Web bundle's API remote or Skill/Tool/MCP marketplace rows; the consuming profile must provide `@deepseek-ai/dsh-web-app`.
- **Restart activation** - newly installed Tool and MCP packages become selectable only after their normal Host activation and restart checks succeed.
- **Target-local configuration** - employee records, Template configuration drafts, and marketplace installations are intentionally not migrated from the bundle author's machine.
