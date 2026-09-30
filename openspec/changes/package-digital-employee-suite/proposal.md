## Why

数字员工的 Host、Web、远程 API、Skill/Tool/MCP 市场能力已经分散在多个 workspace package 中，其他 DeepSeek Harness 工程无法用一个稳定的安装入口复用完整功能。需要把这些能力组装成可安装的 bundle，同时隔离用户数据、凭据和市场安装内容，避免跨工程复制本机路径或配置导致启动失败。

## What Changes

- 新增一个可发布、可安装的数字员工 suite bundle，统一组装数字员工核心、配置台、聊天提及入口以及 Skill/Tool/MCP 市场。
- 把 Skill/Tool/MCP/Hook/Workflow/Subagent 市场、数字员工、公司三类域行从 dsh-web-app 抽入 suite：suite 是这三个域的唯一所有者，dsh-web-app 保留通用浏览器面与共享 api-remotes 载体。
- shipped web profile 模板组合 base + web-app + suite，并把拆分前的 `[base, web-app]` 元组登记为安装方所有，现有部署在下次启动时无损迁移到新模板。
- 为 bundle 声明完整的 Host、Client、API、preset、市场和持久化依赖，并保证远程 namespace 只注册一次。
- 使目标 Harness 工程安装 bundle 后，通过 profile 配置即可获得数字员工、公司和市场 UI。
- 明确模板、员工实例、市场安装包和凭据引用保存在目标工程自己的 Harness home，不随 npm bundle 携带。
- 增加安装、启动、卸载和跨工程数据隔离测试，覆盖 Web 入口、Template configuration、市场入口和 `@数字员工`。
- 通用 Web 面（不含三个域）仍可直接使用 `@qq296629801/dsh-web-app`；三个域作为一个 bundle 安装。

## Capabilities

### New Capabilities

- `digital-employee-suite-bundle`: 可安装的数字员工完整 bundle、依赖组装、profile 使用方式和生命周期。

### Modified Capabilities

- `digital-employee-configuration-studio`: 配置台在独立 bundle 安装后可用，并将模板数据写入目标 Harness home。
- `digital-employee-management`: 管理 Host 在外部工程中加载模板、市场能力和本地持久化数据。
- `skill-market-management`: 市场插件作为 suite 的可选组成部分，使用目标工程的用户技能目录。
- `tool-marketplace`: Tool 市场在 suite 中保持独立安装根目录和重启激活要求。
- `mcp-marketplace`: MCP 市场在 suite 中保持独立安装根目录、凭据引用和重启激活要求。
- `digital-employee-chat-mentions`: 独立 bundle 安装后仍注册 `@数字员工` 输入触发器。

## Impact

- 新增 `packages/bundle/digital-employee-suite` 及其构建、发布和文档配置。
- 从 dsh-web-app 移除三个域的 Host 行、浏览器行与对应依赖，避免 suite 与 Web bundle 重复挂载同一远程 namespace。
- shipped web profile 模板与安装方迁移元组变更（`PROFILE_TEMPLATES` / `INSTALLATION_OWNED_PROFILE_TUPLES`），apps/cli 依赖闭包含 suite 以供模块回退解析。
- 装配级组合 harness（assembled boot、Web e2e scaffold、presets e2e）改为三层 bundle 栈。
- 新增跨临时 Harness home 的 Loader、Host、客户端和 Web E2E 验证。
- 不迁移、不打包现有用户的 `$DSH_HOME` 数据、凭据、模板资源或市场安装目录。
