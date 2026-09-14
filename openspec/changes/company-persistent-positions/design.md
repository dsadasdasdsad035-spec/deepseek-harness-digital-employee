# Design: company-persistent-positions

## Context

`setCampus` spawns 12 anonymous cars at random edges; `spawnNpcs` seats everyone. `worldEntities` already keys cars as `car-<index>` — the stable identity exists. A durable store is needed plus restore validation.

## Decisions

### D1. One world-state store, stable ids, merge writes

`$DSH_HOME/companies/world-state.json` via `dsh-company-file/world-state`: `{cars: Record<id, {from,to,t,speed,at}>, employees: Record<employeeId, {companyId,x,z,seated,at}>}`. `reportCompanyWorldState` merges under `withFileLock`; reads are strict. Bounded by fleet size and roster — no cap. Stale entries (departed employees) are harmless and ignored by restore validation.

### D2. Restore validates, then falls back

Cars: a saved entry restores only when both node indices exist in the current road graph and 0≤t≤1; otherwise random spawn (first appearance or graph change). NPCs: a saved entry restores only when the company matches and the position probe is collision-clear in the built registry; otherwise seat. `seated` entries restore to the sit phase; standing entries restore standing with a short dwell so wandering resumes naturally.

### D3. Reporting cadence

While the console overlay is open, the store reports every 5 s (the floor-poll cadence) and once on close: cars (`car-<i>` → current edge/progress/speed) and visible floor NPCs (position + seated). Positions are presentation data on the host — never model-visible, so no session events.

## Risks / Trade-offs

- 5 s snapshots make car resume approximate (a car may repeat a few metres) — accepted; "continue from the last coordinate" is the requirement.
- Layout changes shift world coordinates; restore validation is the safety net (walls probe), falling back to seats.

## Open Questions

None.
