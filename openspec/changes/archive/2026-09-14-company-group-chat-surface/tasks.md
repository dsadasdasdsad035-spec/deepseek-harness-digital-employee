# Tasks: company-group-chat-surface

## 1. Host: session marker

- [x] 1.1 `types.ts`: `company-group/opened` event `{companyId}` in the SessionEventMap declaration; `ensureGroup` appends it before the title on creation; unit test (marker is first event, idempotent on reopen)
- [x] 1.2 company-console snapshot stays green (acceptance lines unchanged); add one assertion if the driver surfaces event order cheaply

## 2. Client: main-surface rendering

- [x] 2.1 Investigate the conversation-node contract in `ui-conversation/conversation-nodes/` (match/state/view lifecycles, existing node examples, how user messages place right)
- [x] 2.2 Implement + register the `company-group/message` node definition (name chip + bubble; user right-aligned); wire the plugin into the web-app composition
- [x] 2.3 Node tests following the existing conversation-node test pattern

## 3. Client: composer routing

- [x] 3.1 Investigate the composer submit seam (session-scoped strategy vs conditional); pick per D3, document the choice in design.md
- [x] 3.2 Implement group-session send routing to `companyGroups.sendCompanyGroupMessage` (marker detection; @mentions flow through host)
- [x] 3.3 Tests: group session send routes to the remote; normal sessions unchanged

## 4. Console entry

- [x] 4.1 「公司群聊」 button: openCompanyGroup → switch main surface to the session → close overlay; remove the embedded group panel + CSS + GroupStore polling (host realtime covers updates)
- [x] 4.2 Live check: sidebar-opened group sessions show full history; typing in the main composer lands in the group and @mentions trigger turns

## 5. Gates and docs

- [x] 5.1 Gates: typecheck, lint, unit tests, company-console snapshot replay, hygiene, doc-sync (new session event → persistence catalog + zh sync)
- [x] 5.2 Docs: ui-companies README (EN/ZH), Agent Note, tasks checked, `openspec validate`
