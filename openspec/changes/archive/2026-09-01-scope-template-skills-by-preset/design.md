## Context

See `proposal.md` for motivation. The Skill registry is layered by scope: Host-global providers contribute the base layer, while each Agent preset contributes filesystem discovery and restrictions through a standing preset scope. Digital employee task startup already mounts the template's preset before composing the employee Agent, but the configuration Gateway currently calls `skills.list()` without a scope.

`AgentPresets.standingKeyFor(preset)` already provides a Host-reader path to the same standing composition used by Agents. It resolves and mounts a usable preset without creating an Agent, Session, or turn. The Skill registry accepts this key through `skills.list({ scope })`.

## Goals / Non-Goals

**Goals:**

- Make template Skill availability match the composition the published employee will use.
- Reuse the preset service's standing lifecycle and single-flight composition.
- Keep marketplace metadata merged by stable Skill name.
- Make preset failures explicit and preserve removable invalid selections.
- Exercise real marketplace installation and preset filesystem discovery in assembled Web coverage.

**Non-Goals:**

- Change Tool or MCP availability resolution.
- Install Skills from Template configuration.
- Introduce a hosted marketplace catalog.
- Create temporary Sessions or Agents for catalog inspection.
- Pin templates to Skill package versions.

## Decisions

### The asset request names the selected preset

The configuration asset operation will accept a preset identity, and the client will request assets for the draft being edited. New-draft creation uses the resolved default preset returned by the Host rather than assuming a client constant.

The alternative was to return catalogs for every preset in one response. That would mount every composition, increase payload and startup work, and refresh unrelated catalogs when one preset changes.

### The Gateway reads the preset standing scope

The Gateway will call `agentPresets.standingKeyFor(preset)` and then `skills.list({ scope: standingKey })`. This uses the same scope ancestry, filesystem provider, restrictions, and standing generation as a real Agent without publishing task runtime state.

The alternative was to restore the Web profile's Host-global `skill-filesystem`. That would make preset-specific restrictions invisible and could mix Skills from compositions that the selected employee cannot run.

The alternative of constructing a disposable mock Agent or Session was also rejected because it would duplicate Agent factory lifecycle, risk product-visible side effects, and still provide a less authoritative scope than the preset service already owns.

### Preset resolution failure is an asset-request failure

Unknown, broken, or unmountable presets will produce a client-safe preset diagnostic. The Gateway will not fall back to unscoped `skills.list()`, because that would present capabilities the eventual employee composition may not have.

The editor retains its last successful catalog only while a refresh is in flight. A failed refresh disables new Skill selection and displays the diagnostic; it does not reinterpret stale entries as available.

### Preset changes refresh before selection

Changing the preset updates the draft field and starts a catalog request for the new preset. Skill controls enter a loading state until the newest request settles. Generation guards prevent an older preset response from replacing a newer selection.

Selected names remain draft-owned state. If the new catalog marks one unavailable or omits it, the editor synthesizes or retains an unavailable removable row. Validation and publication resolve against the draft's current preset independently of browser state.

### Validation uses the same preset-scoped lookup

Draft validation and publication will resolve the selected preset scope and verify every authorized Skill against that scoped catalog. The asset list and publication gate therefore use one availability rule instead of trusting a prior UI response.

### Web E2E uses real installation and preset discovery

The assembled test will install a ZIP through `skillMarket.install()` into an isolated Harness home, use an actual preset containing `skill-filesystem`, and verify that Template configuration can select the resulting Skill. It will also use a preset without that provider or with an explicit restriction to prove preset isolation.

The existing manual `ctx.skills.register()` activation shortcut will be removed because it bypasses the production composition path that caused this defect.

## Risks / Trade-offs

- [First catalog request mounts a cold preset and may take longer] → Show a bounded loading state and reuse the preset service's single-flight standing mount for later requests.
- [A preset composition has side-effectful plugins] → Rely on the existing standing-mount invariant that rejects process-global service leaks; document that standing composition may start preset-owned providers such as filesystem watchers but never task runtime.
- [Preset files change while an editor is open] → The preset service generation check refreshes subsequent requests; validation and publication perform a fresh scoped resolution.
- [Concurrent preset switches return out of order] → Apply client generation guards and publish only the newest request.
- [Marketplace installation mutates during editing] → Reload after marketplace mutations and revalidate immediately before publication.

## Migration Plan

1. Extend the configuration asset request with the selected preset identity and regenerate Remote declarations.
2. Add preset-scoped Host lookup and reuse it in validation and publication.
3. Update the client store and editor to load assets per preset with loading, failure, and stale-selection states.
4. Replace the assembled test shortcut with real marketplace installation and preset discovery.
5. Deploy Host and Web together because the Remote request changes.
6. Roll back both surfaces together; persisted drafts remain compatible because they already store preset and stable Skill names.
