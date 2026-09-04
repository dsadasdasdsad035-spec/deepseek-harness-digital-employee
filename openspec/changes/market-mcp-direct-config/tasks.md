## 1. Market service: direct-config store and operations

- [x] 1.1 Add direct-config request/result/failure types (`mcp-direct-config.ts` in `packages/mcp/mcp-market/src/types.ts`): create/update/delete/list requests, `source: 'direct' | 'package'` inventory discriminant, branded `McpDirectConfigEntryId`
- [x] 1.2 Implement the durable store: atomic-read/write `direct-configs.json` under the market user directory, credential-reference-only records, load-on-composition remount of persisted entries
- [x] 1.3 Implement save-path validation: server-name uniqueness against managed packages and other direct entries (inside the existing keyed mutex), stdio interpreter allowlist, empty-fixed-value credential slot rule with suspected-secret rejection, user-declared cwd existence check
- [x] 1.4 Implement hot mount lifecycle: mount on save (mount-new-then-dispose-old for edits), unmount on delete/rename, in-memory `entryId → disposer` map, structured degraded-diagnostic on failed replacement
- [x] 1.5 Add `confirmLocalExecution` gate returning the existing `local-execution-confirmation-required` failure for stdio saves without confirmation
- [x] 1.6 Merge direct entries into `McpMarketListResult` inventory with the `source` discriminant and no resolved values

## 2. Gateway and client wiring

- [x] 2.1 Expose the new operations through the digital-employee-management gateway with the same failure-to-response mapping as existing market routes
- [x] 2.2 Extend `McpMarketStore` (`packages/client/ui-skill-market/src/client/package-stores.ts`) with direct-config CRUD actions, pending-confirmation state reuse, and optimistic refresh

## 3. Web UI

- [x] 3.1 Add the direct-config maintenance section beside the `Uploader` in `McpPanel`: entry table (name, transport, availability, diagnostic), create/edit form with transport-specific fields, delete confirmation
- [x] 3.2 Wire the stdio disclosure modal to the save path via the existing `pendingLocalExecution` confirmation flow
- [x] 3.3 Add bilingual locale keys for all new strings in `locales.ts`
- [x] 3.4 Cover the assembled market page with keyless jsdom component tests (HTTP save, stdio disclosure, save payload assertions) — the ACP snapshot harness replays agent transcripts and does not exercise the settings UI, so component tests own this surface

## 4. Tests

- [x] 4.1 Market service unit tests: store atomicity, slot/reference rules, allowlist and cwd rejection, uniqueness both directions, mount/dispose ordering on edit and delete
- [x] 4.2 Gateway spec coverage for the new routes and failure mapping
- [x] 4.3 Client component tests for the maintenance form, confirmation modal reuse, and inventory merge rendering

## 5. Docs and notes

- [x] 5.1 Update `packages/mcp/mcp-market/README.md` and `README.zh.md` with the direct-config contract and its security posture
- [x] 5.2 Update the feature Agent Note and config catalog if a new config field is introduced; run `pnpm run doc-sync`
- [x] 5.3 Write the implementation Agent Note for this change
