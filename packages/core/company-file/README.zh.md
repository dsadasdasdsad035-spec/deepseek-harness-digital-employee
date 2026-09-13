# @deepseek-ai/dsh-company-file

[English](README.md) | 中文

文件公司 provider：每个 harness home 一份 JSON 文档（`$DSH_HOME/companies/companies.json`，`SCHEMA_VERSION = 1`；可选的 `skinId` 字段随公司往返）。每次变更在 `withFileLock` 内重读文档、施加变更、以 `writeFileAtomic`（0600/0700）原子发布；不支持的 schema 版本直接失败而非迁移。新公司预置部门 总裁/人力/行政/IT/销售；删除部门把成员移入该公司未分配集合，删除公司解除全部成员绑定。注册为唯一的 `ctx.companies` provider。

## Model Experience

无。本包存储公司记录，不贡献提示词、工具或会话事件。

#### KV Cache effect

无；公司状态不进入模型请求。

## Known Limitations and Deferred Work

- **单节点 JSON 文档** —— 一个 harness home、一个写者进程家族；多节点部署需要共享存储。
- **加载期不剪绑定** —— 悬空实例绑定由网关的 before-delete 订阅剪除，不在文档加载时处理。
