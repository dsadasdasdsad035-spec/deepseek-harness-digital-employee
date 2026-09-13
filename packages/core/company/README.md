# @deepseek-ai/dsh-company

English | [中文](README.zh.md)

Company Service Definition for the DeepSeek Harness: durable companies that organize digital employee **instances** (not templates). `ctx.companies` owns the provider seam — list/get/create/update/delete companies, preset-plus-custom departments, employee bindings (one instance, one company, one department), promotional-image references, and an optional per-company `skinId` naming a console rendering skin (absent means the `modern` default; the id is opaque here — the client owns the catalog). The companion file provider lives in `@deepseek-ai/dsh-company-file`.

Every mutation goes through the configured provider; mutations publish `companies/change` naming the affected company. Bindings reference `DigitalEmployeeInstanceId`; instance deletion is expected to unbind through `digital-employees/before-delete` (the management gateway owns that subscription).

## Model Experience

None, as this package stores company records; it contributes no prompt content, tools, or session events.

#### KV Cache effect

None; company state never enters a model request.

## Known Limitations and Deferred Work

- **Single provider seat** — one durable company provider per deployment; the seam exists for a future shared-store implementation, none is planned pre-release.
