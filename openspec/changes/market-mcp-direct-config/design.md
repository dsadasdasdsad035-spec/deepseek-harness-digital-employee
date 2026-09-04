## Context

The market service (`packages/mcp/mcp-market`) currently owns only signed packages. Its activation path already mounts servers on the root context through `ctx.mcpClients.mount(...)` and receives disposers back (`packages/mcp/mcp-market/src/index.ts:205,231`), so a live server can be replaced by disposing the old mount and mounting anew. The `McpClientManager.mount` API (`packages/mcp/mcp-client/src/index.ts:173`) accepts the full `McpServerConfig` union and returns an async disposer — hot mount/unmount needs no manager changes. Credential resolution (`resolveSlotValue`), the stdio interpreter allowlist (`stdioInterpreters`, default `['node']`), and scrubbed-environment rules all live in the market service today and are directly reusable. The Web surface is `McpPanel` in `packages/client/ui-skill-market/src/client/SkillMarketSection.tsx`, currently upload-only.

## Goals / Non-Goals

**Goals:**
- CRUD over user-declared MCP server configs persisted credential-reference-only, surviving restarts.
- Immediate mount on save, unmount on delete/rename, re-mount on edit — no Host restart.
- Same security posture as packaged stdio: interpreter allowlist, scrubbed env, explicit local-execution confirmation on the save path.
- Name uniqueness across direct configs and managed packages, both directions, structured failures.

**Non-Goals:**
- OAuth/remote discovery flows or a public server directory.
- Editing packaged servers in place (packages stay immutable; upgrade path unchanged).
- Hot reload for packaged installs (they keep the restart model).
- Per-tool overrides (timeouts, enablement) beyond what `McpServerConfig` already carries.

## Decisions

**D1: Direct configs live in the market service, not a new plugin.** The market plugin already injects `credentials` + `mcpClients`, already owns interpreter-allowlist and credential-slot logic, and is what the Web client talks to. A separate plugin would duplicate the slot/allowlist/mount machinery. Alternative considered: extend `dsh-mcp-client` config file — rejected because it is declarative cordis.yml, not runtime-mutable, and would drag in file-watch/reload semantics.

**D2: Persistence is one user-private JSON file (`direct-configs.json`) under the existing market user directory.** Entries store: stable `entryId` (branded id), `serverName`, transport declaration (fixed values for non-credential slots, reference names for credential slots), `createdAt/updatedAt`. Resolved secret values are never written, mirroring the package path. Atomic write (temp + rename) matches the package publication rule. Alternative: SQLite — rejected; the data is a handful of small records with no query needs.

**D3: Hot mount bookkeeping stays in the market service.** The service keeps an in-memory `Map<entryId, disposer>` populated on save and on composition-time remount of persisted entries. Edit = validate new config → mount replacement under a temp name? No — mount new first, then dispose old only on success; if the new mount fails, the old stays live and the failure is returned structurally with the entry marked `degraded`. Rename = dispose old after new-name mount succeeds. Delete = dispose then erase record.

**D4: stdio cwd is user-declared and validated at save.** Unlike packages (cwd is the managed package dir), direct stdio entries run from a user-supplied cwd that must exist at save time; args may reference absolute paths on the user's disk — there is no signed file table to confine them. This is the accepted trade-off of direct configuration: the user vouches for the entry the same way they would for a cordis.yml entry. The scrubbed-parent-env and interpreter-allowlist rules still apply unchanged.

**D5: Confirmation rides the save request, same shape as package install.** `confirmLocalExecution?: boolean` on the create/update request; a stdio save without it returns the existing `local-execution-confirmation-required` failure code so the Web client reuses the current disclosure modal (`pendingLocalExecution`) unchanged.

**D6: Inventory merge is presentation-only.** `McpMarketListResult.entries` gains direct-config entries marked with a new discriminant (`source: 'direct' | 'package'`). Package-side consumers that switch on entry shape use the discriminant; the field is additive so existing clients keep compiling.

## Risks / Trade-offs

- [Hot-mounted stdio runs arbitrary local code with no publisher gate] → Mitigated by the same allowlist + scrubbed env + explicit disclosure as packages; the disclosure text states the entry is user-authored. Residual risk accepted: direct config is a power-user path by definition.
- [Edit failure leaves old server live while the record holds the new config] → Mount-first-then-dispose keeps runtime and record consistent per attempt; on failure the record keeps the previous config (not the new one) and the structured failure carries the diagnostic, so there is no silent divergence.
- [Name collisions during concurrent package install and direct save] → Both paths check uniqueness inside the market service's existing keyed mutex for market mutations.
- [Unmount mid-tool-call] → The manager's fiber dispose already owns connection teardown; in-flight tool calls fail with the connection error, same as a packaged server crashing — no new semantics introduced.

## Migration Plan

Additive: new service operations, one new persisted file, one additive inventory field. No on-disk format of packages changes; no `SESSION_FORMAT_VERSION` impact (market operations never touch the session log). Rollback = remove the UI entry point; persisted `direct-configs.json` is inert when no consumer reads it.

## Open Questions

None blocking; the transport declaration reuses the template-declaration union shape (`McpMarketTemplateDeclaration`) and slot rules are settled by the existing package contract.
