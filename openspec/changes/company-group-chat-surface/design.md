# Design: company-group-chat-surface

## Context

The conversation renderer is an event-node registry (`ctx.conversationEvents.register(ConversationNodeDefinition)` with `match(event)`); unknown events fall to a registered fallback. The main composer submits to the session's root agent. Group sessions are real sessions whose messages are `company-group/message` reference events; today only the console's embedded panel renders them.

## Goals & Non-Goals

Goals: group = a session in the main surface (read + write); console button becomes an open-session shortcut; no session-format change.

Non-Goals: employee-to-employee chains, group management UI, restructuring the assistant message presentation, mobile layouts.

## Decisions

### D1. Session identity via a creation marker event, not headers or id prefixes

`ensureGroup` appends `company-group/opened {companyId}` as the session's first event (before the title). Any holder of the session's events detects the group-ness and the companyId deterministically. Rationale: adding a header field is a structural format change (version bump, persistence churn) and prefix-matching the gateway's id scheme couples every consumer to one gateway's naming; a typed event is additive and already the vocabulary of this feature.

### D2. Rendering via a ConversationNodeDefinition, not renderer edits

One definition (kind `company-group/message`) with `match` claiming exactly that event; the view renders a name chip (displayName) plus text — employee speakers left-aligned, `speakerKind === 'user'` right-aligned to match user-message placement. No streaming grammar needed: reference messages arrive whole.

### D3. Composer routing decided at the session, through the marker

The composer's submit path gains a group branch: when the active session's events carry the marker, send routes to `companyGroups.sendCompanyGroupMessage(companyId, text)`; otherwise the normal agent submission. The exact seam (a session-scoped submit strategy vs a conditional in the composer service) is an apply-time investigation with a stated fallback: if the composer seam proves single-agent-assumption-bound, ship D2 (read fusion) plus the console panel composer and file the routing follow-up — never fork the composer.

### D4. The console button navigates instead of hosting

「公司群聊」 calls openCompanyGroup (create-if-needed), then switches the main surface to that session (the same navigation the sidebar uses) and closes the overlay. The embedded group panel and its CSS are removed; the roster chip data can later ride the session header area, out of scope here.

## Risks / Trade-offs

- The composer seam is the one genuinely unverified integration point (D3 names the fallback).
- Marker-based detection means old group sessions created before this change lack the marker; acceptable pre-release (no compatibility promise), note in tasks.

## Migration Plan

Client + additive host marker; rebuild + reload. Sessions created before the change stay empty-looking until recreated (pre-release stance).

## Open Questions

None blocking; D3's seam choice is a flagged apply-time investigation.
