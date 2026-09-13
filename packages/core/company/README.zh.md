# @deepseek-ai/dsh-company

[English](README.md) | 中文

DeepSeek Harness 的公司 Service Definition：以持久化公司组织数字员工**实例**（非模板）。`ctx.companies` 拥有 provider 缝——公司增删改查、预置加自定义部门、员工绑定（一个实例、一家公司、一个部门）、宣传图引用，以及可选的每公司 `skinId`（命名一套控制台渲染皮肤；缺省即 `modern` 默认皮肤。该 id 在此处不透明——目录归客户端持有）。配套文件 provider 位于 `@deepseek-ai/dsh-company-file`。

所有变更经由已配置的 provider；变更发布 `companies/change` 并指明受影响公司。绑定引用 `DigitalEmployeeInstanceId`；实例删除时应通过 `digital-employees/before-delete` 解绑（该订阅由管理网关持有）。

## Model Experience

无。本包存储公司记录，不贡献提示词、工具或会话事件。

#### KV Cache effect

无；公司状态不进入模型请求。

## Known Limitations and Deferred Work

- **单 provider 座位** —— 每个部署一个持久化公司 provider；缝为将来的共享存储实现保留，pre-release 期间不计划。
