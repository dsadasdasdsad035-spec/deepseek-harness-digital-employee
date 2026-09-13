# Proposal: company-interior-npc-life

## Why

Bound employees render as permanently seated figures — idle and busy look identical except for chips and screens. Owners expect living employees: idle ones leave their desks and wander the office (tea/water at the pantry, smoking area, toilet, lounge), and a working employee walks back to their desk and sits down. "Working" is already defined by the existing busy derivation (running chat session, or a fresh autonomous-task write).

## What Changes

- `packages/client/ui-companies` `scene.ts`:
  - Interior gains 厕所 and 吸烟区 amenity cells in the front band (stalls/sinks; bench/ashtray), each labeled, joining 茶水区 and 休息区 as walkable destinations.
  - The person figure separates from the desk: desks (with screens and bind hints) stay at seats; persons are independent NPC groups carrying their name and status chip.
  - Per-member NPC behavior in the render loop: idle members periodically stand up, walk corridor-routed paths to a random amenity, dwell, wander on, or return to sit; the busy flip (existing `updateBusy`) sends them walking straight back to their desk and re-seats them (screen lights, 在忙 chip).
- No host, data, remote, or wire-type changes; busy semantics stay exactly the existing derivation.

## Capabilities

### Modified

- `company-3d-console`: the 三维公司内部场景 requirement gains toilet/smoking areas and idle-wandering/busy-returning employee figures.
