# @deepseek-ai/dsh-company-file

English | [中文](README.zh.md)

File-backed company provider: one JSON document per harness home (`$DSH_HOME/companies/companies.json`, `SCHEMA_VERSION = 1`; an optional `skinId` field round-trips per company). Every mutation re-reads the document inside `withFileLock`, applies the change, and publishes with `writeFileAtomic` (0600/0700); unsupported schema versions fail loud instead of migrating. New companies seed the preset departments 总裁/人力/行政/IT/销售; department deletion moves members to the company's unassigned group, and company deletion unbinds every member. Registers as the sole `ctx.companies` provider.

## Model Experience

None, as this package stores company records; it contributes no prompt content, tools, or session events.

#### KV Cache effect

None; company state never enters a model request.

## Known Limitations and Deferred Work

- **Single-node JSON document** — one harness home, one writer process family; multi-node deployments need a shared store.
- **No load-time instance pruning** — dangling instance bindings are pruned by the gateway's before-delete subscription, not at document load.
