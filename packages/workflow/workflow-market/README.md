# `@deepseek-ai/dsh-workflow-market`

English | [中文](README.zh.md)

Managed install and employee-scoped mounting for marketplace workflow packages.

## Configuration

`installRoot` is the private user directory for managed packages. `trustedPublishers` / `trustedPublishersFile` carry Ed25519 publisher keys; `allowUnsignedPackages` is the development override with the same semantics as the other package markets.

## Package lifecycle

Install, upgrade, and uninstall are restart-bound; a fresh Host composition projects installed descriptors for employee mounting. Every install requires the explicit local-execution confirmation because workflow packages execute local code.

## Employee mounting

`mountEmployeeWorkflows(agentCtx, bindings)` registers one model-facing surface per declared entry — `workflow__<id>` — starting the packaged script on the workflow engine. Bindings are instance-scoped: only the binding employee's composition exposes them.

## Model Experience

### Bound workflow assets

#### What the model sees

Within a binding employee's composition, every declared entry registers as `workflow__<id>` — a tool that starts the packaged workflow script on the workflow engine and returns its JSON result. Passive or unbound assets never appear.

#### Token effect

One short tool schema per bound entry, stable while the employee's bindings and package versions are unchanged.

#### KV Cache effect

Mounting or unbinding a package changes the request prefix on the next composition.

## Known Limitations and Deferred Work

- **Worker threads isolate workflow execution but are not a security boundary** — inherited from the workflow engine.
- **Declarative personas only** — provider code is never distributed; the spawn driver is the fixed execution backend.
