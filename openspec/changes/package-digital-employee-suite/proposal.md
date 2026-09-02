## Why

数字员工的 Host、Web、远程 API、Skill/Tool/MCP 市场能力已经分散在多个 workspace package 中，其他 DeepSeek Harness 工程无法用一个稳定的安装入口复用完整功能。需要把这些能力组装成可安装的 bundle，同时隔离用户数据、凭据和市场安装内容，避免跨工程复制本机路径或配置导致启动失败。

## What Changes

- 新增一个可发布、可安装的数字员工 suite bundle，统一组装数字员工核心、配置台、聊天提及入口以及 Skill/Tool/MCP 市场。
- 为 bundle 声明完整的 Host、Client、API、preset、市场和持久化依赖，并保证远程 namespace 只注册一次。
- 使目标 Harness 工程安装 bundle 后，通过 profile 配置即可获得数字员工和市场 UI。
- 明确模板、员工实例、市场安装包和凭据引用保存在目标工程自己的 Harness home，不随 npm bundle 携带。
- 增加安装、启动、卸载和跨工程数据隔离测试，覆盖 Web 入口、Template configuration、市场入口和 `@数字员工`。
- 保留现有直接使用 `@deepseek-ai/dsh-web-app` 的行为；数字员工 suite 作为可选扩展 bundle 提供。

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
- 修改 Web bundle 或共享 API 组装规则，避免数字员工 suite 与 Web bundle 重复挂载同一远程 namespace。
- 影响 profile 的 bundle 列表、workspace 依赖和构建产物。
- 新增跨临时 Harness home 的 Loader、Host、客户端和 Web E2E 验证。
- 不迁移、不打包现有用户的 `$DSH_HOME` 数据、凭据、模板资源或市场安装目录。
