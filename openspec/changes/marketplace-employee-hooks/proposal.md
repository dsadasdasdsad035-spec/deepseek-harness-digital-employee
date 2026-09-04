## Why

Hooks are today host-configured only (Claude Code / Codex bridges reading a local `hooks.json`), so neither the marketplace acquisition path nor digital employees can extend the agent at lifecycle interception points. The marketplace already distributes executable packages safely (tool | mcp kinds, signed, file-tabled, disclosure-gated), and employee templates already declare capability references — hook packages close the gap with one more kind on the same machinery.

## What Changes

- Add `hook` as a third marketplace package kind: a `hook-package.json` descriptor declares shell-command hooks, each bound to interception events (UserPromptSubmit, PreToolUse, PostToolUse, Stop, SessionStart) with optional matchers, reusing the signed file table, publisher trust, atomic publication, credential-reference slots, and the stdio interpreter allowlist / local-execution disclosure.
- A hook package entry may declare `invocable: true`: installation additionally registers a model-facing tool (`hook__<serverName>`) that runs the hook command on demand and returns its stdout as the tool result — this is how the chat window triggers hooks.
- Ship a native-hook bridge plugin (like the Claude Code / Codex bridges) that mounts installed hook packages on the owning context and drives them through the existing `dsh-hook-protocol` runner (`hook/invoked` / `hook/result` session records included).
- Extend digital employee templates with a `hooks: string[]` capability reference alongside `skills` / `tools` / `mcpServers`; employee instance composition resolves installed hook packages per instance and rejects unresolved references before task start. Instance-bound hooks are scoped to that employee's composition.
- Extend the digital employee configuration studio to list installed hook packages, their event bindings and invocability, and to let administrators bind/unbind hooks on an employee.
- Ship a signed publisher template package (`hook-market-template.zip`) containing one `invocable` test hook that echoes its stdin payload, for end-to-end verification of install → bind → chat-trigger.
- **BREAKING**: `MarketplacePackageKind` widens from `'tool' | 'mcp'` to include `'hook'`; managed-manifest readers that switch exhaustively on kind must add the branch (single-repo, no external consumers per the pre-release stance).

## Capabilities

### New Capabilities

- `hook-marketplace`: acquisition, trust, managed lifecycle, and inventory of hook packages in the marketplace, including invocable-hook tool registration.
- `employee-hook-bridge`: mounting installed hook packages onto an employee composition, executing them through the shared hook protocol, and the chat-window invocation path for invocable hooks.

### Modified Capabilities

- `digital-employee-templates`: templates gain a `hooks` capability reference; composition must resolve installed hook packages per instance like `mcpServers`.
- `digital-employee-configuration-studio`: the administrator catalog and studio join hook packages with binding state and present bind/unbind actions.

## Impact

- `packages/util/marketplace-core` — third `MarketplacePackageKind`, `hook-package.json` descriptor schema + parser, managed-package kind, CLI/builder support.
- `packages/hooks` — new bridge plugin package (`hooks-market` or similar) consuming installed hook packages through `dsh-hook-protocol`.
- `packages/mcp/mcp-market` — none; the Web market tab reuses the shared package upload path (client-side store branch on kind).
- `packages/client/ui-skill-market` — a Hooks panel (or kind tab) for install/uninstall/upgrade and credential references.
- `packages/host/digital-employee-management` — template schema, studio catalog join, composition resolution for hook references.
- Docs and catalogs — config catalog, api catalog, bilingual READMEs, publisher template, Agent Note.
