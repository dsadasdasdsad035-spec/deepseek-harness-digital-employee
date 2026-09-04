## 1. marketplace-core: hook package kind

- [x] 1.1 Widen `MarketplacePackageKind` and managed-manifest kind to `'tool' | 'mcp' | 'hook'`; update every exhaustive switch and the descriptor filename map (`hook-package.json`)
- [x] 1.2 Add the `hook-package.json` descriptor schema + parser: entries with `id`, `event` (UserPromptSubmit/PreToolUse/PostToolUse/Stop/SessionStart), `matcher` (required outside SessionStart), `command`, `args`, `env`, `envCredentials`, `timeoutSec?`, `invocable?`; empty-fixed-value credential rule and implied `subprocess` permission
- [x] 1.3 Extend `dsh-market-package` CLI/builder and the publisher template generator for kind `hook`; ship the signed `hook-market-template.zip` with one invocable echo test hook
- [x] 1.4 Unit tests: descriptor validation (unsupported event, bad matcher, non-allowlisted interpreter, secret-valued slot), builder round-trip, archive/managed lifecycle for kind `hook`

## 2. Market service and web client

- [x] 2.1 Extend the shared package market service (kind-parameterized upload/install/inventory) to accept hook packages with `confirmLocalExecution` gating and credential-reference slots
- [x] 2.2 Web client: Hooks panel in the market section (upload, list, upgrade, uninstall, credential references) with kind-aware store branching; bilingual locale keys
- [x] 2.3 Client component tests: install a hook package, disclosure flow, inventory rendering with event bindings and invocability

## 3. Native hook bridge

- [x] 3.1 New bridge plugin under `packages/hooks` (manifest in `vendor`-style README + config): load installed hook packages, validate matchers, register per-event interception handlers calling `runHook`, `createDetachedRuns` quiescence, `hook/*` session records
- [x] 3.2 Invocable tool registration `hook__<serverName>` on the root/employee context: tool input as payload, stdout as result, structured failure for unbound or non-invocable targets
- [x] 3.3 Remote/gateway surface: inventory of installed hook packages with event bindings; restart-required install semantics consistent with other package kinds
- [x] 3.4 Bridge tests: matcher filtering, timeout, merge precedence, invocation tool happy path + rejected unbound/non-invocable call, disposal quiescence

## 4. Digital employee templates and studio

- [ ] 4.1 Template schema gains `hooks: string[]`; composition resolves instance + template hook references to installed packages on the employee context; unresolved references block task start with a named diagnostic
- [ ] 4.2 Configuration studio catalog joins installed hook packages (event bindings, invocability, credential requirements); bind/unbind writes reference names only; draft validation reports unresolved hook references
- [ ] 4.3 Tests: template registration with hook references (valid + missing package), per-instance scoping (bound hooks intercept only their employee), composition resolution failure, studio bind/unbind validation

## 5. End-to-end and docs

- [ ] 5.1 Snapshot: assembled flow — install test hook, bind via template, `@employee` chat task invoking the hook tool, assert tool result and `hook/*` records; bilingual expected outputs updated in the same change
- [ ] 5.2 Bilingual docs: `packages/hooks` README (new bridge row), market README section, publisher template instructions, config/api catalog regeneration, doc-sync
- [ ] 5.3 Implementation Agent Note (bilingual) recording the invocable-tool decision and the instance-scoping boundary
