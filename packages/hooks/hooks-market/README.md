# `@deepseek-ai/dsh-hooks-market`

English | [中文](README.zh.md)

Managed install, credential-reference configuration, and employee-scoped mounting for marketplace hook packages (`hook-package.json`, the third package kind alongside Tool and MCP).

## Configuration

`installRoot` is the private user directory for managed hook packages. `trustedPublishers` / `trustedPublishersFile` carry Ed25519 publisher keys; `stdioInterpreters` (default `['node']`) allowlists bare hook interpreter commands; `allowUnsignedPackages` is the development override with the same semantics as the other package markets.

## Lifecycle

Install, upgrade, configuration, and uninstall are restart-bound: a fresh Host composition resolves installed descriptors for employee mounting. Credential references persist by name only; resolved values exist only inside a hook run's environment. Every hook package install requires the explicit local-execution confirmation.

## Employee mounting

`mountEmployeeHooks(agentCtx, bindings)` (see `src/bridge.ts`) registers passive interception handlers for each declared event and one `hook__<id>` model tool per `invocable` hook, executed through the shared `dsh-hook-protocol` runner. Bindings are instance-scoped: only compositions of the binding employee run the commands.

## Model Experience

### Invocable hook tools

#### What the model sees

Only hooks declared `invocable` appear, as `hook__<id>` tools within an employee composition that binds the package. A call runs the hook command with `{ "input": ... }` as the stdin payload and returns the command's stdout as the tool result. Passive hooks never appear as tools; their effects reach the model through the interception points (blocked outcomes, injected context).

#### Token effect

One tool schema per bound invocable hook: a short name, description, and one optional string parameter.

#### KV Cache effect

Tool schemas are part of the request prefix; schemas stay stable while the employee's hook bindings and package versions are unchanged. Mounting or unbinding a package changes the prefix on the next request.

## Known Limitations and Deferred Work

- **Passive SessionStart bindings mount with the Host, not per employee turn** — instance scoping covers the four turn-enclosed points fully; detached SessionStart behavior follows the host-level bridge.
- **Hook input rewrite stays deferred** — `updatedInput` remains governed by the pre-tool-input-rewrite Agent Note, exactly as for the other bridges.
