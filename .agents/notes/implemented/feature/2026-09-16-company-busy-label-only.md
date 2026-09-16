# Agent Note: Company floor busy is a label, not a movement driver

Status: implemented

English | [中文](2026-09-16-company-busy-label-only.zh.md)

## Problem

The office floor used one employee state — "busy" — for two unrelated things: painting the head-top `在忙`/`空闲` label, and steering the NPC's body. Four couplings made busy a movement input: a busy walker was force-routed home, a seated busy member was barred from starting a trip, a busy member was barred from ending an amenity dwell, and the busy flip re-issued a walk-home route. The two roles disagreed on time scale: one session turn (a mention in the group, a short 1:1 reply) finishes in a couple of seconds, while a door-aware walk back to a desk takes several. So the walk home was interrupted by the turn ending, the member immediately re-decided after the idle flip (`updateBusy` set `nextDecisionAt = 0`), and the result read as "a member marked 在忙 that keeps running around."

## Decision

- **Busy drives presentation only.** The four couplings are removed. A member's trip is no longer cancelled when it goes busy, a seated member decides whether to leave regardless of busy, and a member at an amenity ends its dwell regardless of busy. A busy member therefore wanders on exactly the same cadence as an idle one.
- **The label is position-independent.** Busy shows on the head-top label whether the member is seated, walking a corridor, or dwelling at an amenity. The desk screen and typing animation remain, but only take effect while the member is seated; a busy member away from its desk shows the label with its screen dark, rather than a remote "someone is here" light over an empty chair.
- **The decision seam is pure.** The seated leave-vs-wait choice moved into an exported `seatedIdleDecision({ time, nextDecisionAt, amenityCount, leaveRoll, pickRoll, waitRoll })`. Busy is deliberately absent from its input, so "busy never gates wandering" is a property of the signature, not a convention the next editor must remember — mirroring the existing `resolveBlockedStep` extraction for the walker's blocked-frame logic.
- **The busy signal itself is unchanged.** `company-management.busyVerdict` already treats a member's own session agent as running under either a 1:1 chat or a group mention (the group case attributes via the member session's audit record), and the client mirrors the live `host/session-status` running bit over the 5-second floor poll. Verified live: a group mention flips `member.running=true` and floor `busy=chat` within a second. Nothing host-side or on the wire changed.

## Alternatives considered

**Keep the walk-home, add a minimum seating dwell.** Rejected: it only hides the time-scale mismatch, and it keeps the behavior the user explicitly ruled out — "not required to return to the desk at all." The member would still leave its trip for a busy flip.

**Drop only the force-route-home, keep the other gates.** Rejected: it leaves a busy seated member never leaving its desk and a busy member pinned at an amenity by the `if (npc.busy) continue` guard — a "busy" figure standing frozen reads as broken, and three busy-gates would still need upkeep.

**Light the desk screen for a busy member from anywhere.** Rejected: a lit screen over an empty chair implies someone is present and muddles the floor's read.

## Consequences

- A member genuinely at work in a group or 1:1 chat shows `在忙` on its head wherever it stands, and keeps its current route; the floor no longer produces the "busy but darting around" impression.
- The floor gives up the (never-specified) implication that busy means "seated at the desk." That is the trade the user chose: the label is the whole of busy's floor-visible effect.
- The pure-function seam adds a small testable surface; the four removed couplings delete more code than the extraction adds.
- No model-visible path, session event, snapshot, or SDK projection is affected — this is purely the client's 3D presentation.

## Testing

- `packages/client/ui-companies/tests/entity-registry.client.spec.ts` gains a `seated idle decision` block: leaving on an eligible under-threshold draw, waiting and re-scheduling on an over-threshold draw, waiting while ineligible, refusing to leave with no amenities, and clamping a pick draw of 1 to the last amenity. Busy is not a parameter, so no case can assert it gates the choice.
- Browser verification on a rebuilt 3080: a group mention flips the member's head label to `在忙` while the member keeps its current trip instead of routing home, and returns to `空闲` with the existing wander when the turn ends.
