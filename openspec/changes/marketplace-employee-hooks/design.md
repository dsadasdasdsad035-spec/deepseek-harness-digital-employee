## Context

The marketplace machinery in `packages/util/marketplace-core` is kind-parameterized today at exactly two points: `MarketplacePackageKind = 'tool' | 'mcp'` (`package-builder.ts`) and the managed-manifest kind (`managed-package.ts: 'tool' | 'mcp'`). Everything else — archive bounds, normalized paths, SHA-256 file table, Ed25519 trust, keyed mutex, atomic publication — is kind-agnostic already. The hook execution side needs no new protocol: `dsh-hook-protocol` owns the runner (`runHook`), matcher evaluation, output merge, detached-run quiescence, and the `hook/invoked` / `hook/result` session records; the existing bridges (`hooks-claude-code`, `hooks-codex`) demonstrate the event-mapping pattern to copy.

Employee templates already declare capability references (`skills` / `tools` / `mcpServers`) with resolution and validation at composition time (`digital-employee-management`), and the configuration studio joins installed assets into one catalog. A previous assembled run also proved that fibers mounted on the gateway's service context cannot register tools — hook mounting must target the root/employee context, the same defect direct-config fixed in `mcp-market`.

## Goals / Non-Goals

**Goals:**
- One new package kind reusing every trust and lifecycle rule; zero changes to the hook wire protocol.
- Instance-scoped hook binding with template inheritance and explicit composition-time resolution.
- Chat-triggerable hooks via invocable declarations that also register a model-facing tool.
- A signed test-hook template package covering the full chain.

**Non-Goals:**
- Editing the external Claude Code / Codex bridge dialects or `hooks.json` parsing (they stay host-configured).
- Hook input rewrite (`updatedInput`) — still governed by the existing deferred Agent Note.
- Global (all-employees) hook installation — direct-config-style host-wide hooks remain a cordis.yml concern.
- Credential-rotation UI; hook packages reuse the existing credential-reference configuration path.

## Decisions

**D1: `hook` is a third package kind in marketplace-core, not a plugin contribution outside the market.** The market path is what carries trust, disclosure, and managed lifecycle; a hook outside it has no provenance. Cost: two exhaustive unions widen (`package-builder.ts`, `managed-package.ts`); both are single-repo and the pre-release stance accepts that.

**D2: The descriptor binds hooks to events declaratively; a new bridge maps declarations onto interception points.** `hook-package.json` entries: `{ id, event, matcher?, command, args, env, envCredentials, timeoutSec?, invocable? }`. A new plugin (placed under `packages/hooks/hooks-market`) reads installed packages from the market directory, validates matchers with `matcherDiagnostic`, and registers per-event handlers that call `runHook` — the same shape as the Claude Code bridge minus dialect parsing. Alternative considered: reuse the Claude Code bridge by generating a `hooks.json` — rejected; it would route a typed surface through a foreign dialect's parser and lose invocable-tool registration.

**D3: `invocable: true` registers a tool named `hook__<serverName>` on the owning context.** The tool calls the same runner with the tool input as the payload (`{ prompt, input }` JSON), bypassing matcher evaluation (a manual run matches everything by definition) and returning stdout as the tool result. Mounting targets the root/employee context — the direct-config defect taught this the hard way. Unmount disposes the fiber; disposal already reaches runner quiescence via `createDetachedRuns`.

**D4: Employee binding is a reference list resolved at composition, mirroring `mcpServers`.** Template gets `hooks: string[]`; instance configuration can extend it. Resolution joins installed packages; missing names fail composition with the standard unresolved-reference diagnostic. Bound packages mount on the employee composition's context so passive hooks intercept only that employee's sessions.

**D5: The studio joins hooks through the existing administrator catalog.** Installed hook packages appear with event bindings and invocability; bind/unbind writes reference names only. Validation reuses the unresolved-reference path; no new credential machinery.

**D6: The test hook template package is the acceptance vehicle.** `hook-market-template.zip` ships one node script, `invocable: true`, bound to `UserPromptSubmit` with an echo matcher, whose command echoes its stdin JSON. The snapshot/e2e story: install → bind to a template → chat `@employee` task that calls the tool → assert tool result and `hook/*` records.

## Risks / Trade-offs

- [Hook packages execute local subprocess code acquired from the network] → Same posture as stdio MCP packages: publisher trust, file-table pinning, interpreter allowlist, scrubbed env, mandatory local-execution disclosure. The residual risk is identical and already accepted for mcp stdio.
- [Passive hooks misfiring on every employee turn] → Matchers default to match-all only when absent; the descriptor requires an explicit matcher for `UserPromptSubmit`/`PreToolUse`/`PostToolUse`/`Stop` bindings so an accidental always-on hook cannot ship silently.
- [Kind-widening breaks exhaustive switches] → Compiler catches every switch via the `assertNever` convention; the only known external readers are the web client store and the studio catalog, both in-repo.
- [Tool-name collisions with `hook__` prefix] → Same namespace discipline as `mcp__<serverName>__<rawName>`; server-name uniqueness is already enforced at install and across compositions.

## Migration Plan

Additive kind + new packages; managed packages of existing kinds untouched. The widened unions are compile-time breaking only inside the repo. Rollback: remove the bridge plugin and the market tab panel; installed hook packages become inert files.

## Open Questions

None blocking; descriptor fields may grow (e.g. `detached` for emit-shaped points) during implementation without changing the spec-level requirements.
