# Agent Note: Company group employee mention picker

Status: implemented

English | [中文](2026-09-16-company-group-employee-mention.zh.md)

## Problem

Group mention routing already worked end to end — the Lead's `agent/pre-step` router resolves `@displayName` by plain substring match and queues a delivery per hit. What was missing was discovery: typing `@` in the group composer popped nothing, so a user had to remember and spell employee display names exactly, and a typo failed silently (no delivery, no reply). The one `@` source that could have served it, `ui-digital-employees`, is deliberately scoped to *starting a new employee task*: it gates candidates on `position === 'leading'` and the session's `blank` bit, and its picks mint a routing reference that creates a fresh employee-owned root Session. A group session is never blank and its messages must land in the group's own log, so that source returns `[]` there by design and must not be forced to do otherwise.

## Decision

- **A second `@` source owns the group composer, not a branch inside the existing one.** `createCompanyGroupMentionSource` lives in `ui-companies` — the package that already owns `remote.companyGroups` and the group session surface — under the distinct name `company-group-member`. `ui-digital-employees` keeps its "start a new task" semantics untouched, so one source never has to produce both a routing reference and a plain-text mention.
- **The pick inserts plain text, not a routing reference.** `onPick` returns `{ text: '@displayName ' }`, which flows through `slash/input-insert-text`; the source declares no `codec` and no `routeSubmit`. The group Lead's substring router then resolves the text exactly as if the user had typed it, so the delivery path is reused with zero new machinery. Inserting a structured reference and adding a group-specific `routeSubmit` was rejected as a second send channel duplicating the router that already owns submit.
- **Group sessions are identified by the `session-company-group-` id prefix.** `candidates()` receives only `ClientSessionContext { sessionId }`, with no access to the session event stream, so the `company-group/opened` marker the spec names is not reachable from the pick path. The deterministic `groupSessionId` prefix is the one signal available per keystroke, and the cancel entry (`groupTurnActions.cancel`) already keys off it; member sessions use the disjoint `session-group-member-` prefix, so the two never collide. `companyIdOfGroupSession` centralizes the parse for both callers.
- **A read-only `listCompanyGroupMembers(companyId)` remote feeds the picker.** It reuses `rosterOf`, the very roster the Lead router matches against, so every offered candidate is guaranteed deliverable. It deliberately performs no `ensureGroup`, no `dispatchPending`, and no persistence scan — the picker re-queries on each keystroke, and opening the group (or replaying queued deliveries) as a side effect of a keystroke would be both semantically wrong and expensive. Candidate value carries the employee id; the display name rides the candidate name so `onPick` needs no roster re-lookup.

## Alternatives considered

**Extend `ui-digital-employees`' source with a group branch.** Rejected: that source's `codec`/`routeSubmit` are routing-reference machinery, and a branch would make one source emit both `insert` (routing) and `text` (plain mention) outcomes while importing `companyGroups` knowledge the package does not own — a worse seam than a second registered source.

**Reuse `openCompanyGroup` for candidates.** Rejected: it creates the group session, builds its Lead agent, dispatches pending deliveries, and scans persistence — per keystroke. The read path must not carry open-group side effects; the correct-foundation pre-release stance favors a purpose-built read remote over caching a heavy call.

**Identify the group by the `company-group/opened` event.** Rejected: unreachable from `candidates()`, which sees only the session id; event-driven detection would force a per-keystroke session-event read for a distinction the id prefix already answers.

## Consequences

- Two `@` sources now coexist on the same trigger with disjoint scopes (leading+blank new task vs. any position in a group session), registered under distinct names so the menu never merges or throws on duplicate registration.
- The picker's roster is fetched per keystroke and is not live-subscribed; a member unbound between the fetch and the submit is handled downstream by the router's existing "left the roster, drop the delivery" path, so the worst case is a briefly stale candidate, never a lost or misrouted message.
- `ui-companies` gains an `inputTriggers` dependency and the `@` trigger in its `dsh.client.inject` list; the group mention source is registered and disposed through `ctx.effect`, matching every sibling source.
- The model-visible path is unchanged: mention resolution stays a deterministic substring match on the Lead, so no transcript, SDK projection, or `SESSION_FORMAT_VERSION` is affected. The host `group.spec.ts` remote-surface assertion and the new picker tests pin both ends.

## Testing

- `packages/host/company-group-chat/tests/group.spec.ts` asserts the new remote appears in the method roster, returns the bound roster, tracks live bindings, and — the load-bearing part — creates no session and never calls `persistenceList`, proving the read path has no open-group side effects.
- `packages/client/ui-companies/tests/group-mention.client.spec.ts` pins group-prefix candidacy, empty results for ordinary and member sessions, query filtering, the plain-text pick outcome, and the absence of `codec`/`routeSubmit`.
- The keyless assembled `company-console` snapshot passes unchanged, confirming the added read remote and client source leave the group transcript identical.
