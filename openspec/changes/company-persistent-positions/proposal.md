# Proposal: company-persistent-positions

## Why

Scene entry re-randomizes everything: NPCs reset to their desks and every campus car respawns on random edges — the world loses continuity between visits. Employees are durable instances and should resume from their last saved coordinates; only newly created employees (first appearance) start at the desk. Cars need stable fleet identities: a car that already exists resumes its edge/progress/speed; only cars appearing for the first time get a random spawn.

## What Changes

- New durable store `companies/world-state.json` (`dsh-company-file/world-state`, lock+atomic): car fleet states (`{from,to,t,speed}` keyed by stable car id) and per-employee last positions (`{companyId,x,z,seated}`).
- `companies` gateway remotes `readCompanyWorldState` / `reportCompanyWorldState` (merge write).
- Client: campus build restores saved cars (validating edge indices), spawns unknown ids randomly; floor build restores saved NPC positions (validating against the collision registry; invalid or company-mismatched falls back to the seat); a 5-second reporter plus a final report on close snapshots cars and NPCs while the console is open.
- Spec: interior requirement gains position persistence; campus requirement gains fleet-state resume.

## Capabilities

### Modified

- `company-3d-console`: persistent employee positions and car fleet states across scene re-entry.
