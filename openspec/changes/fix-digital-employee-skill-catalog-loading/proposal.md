## Why

When a user starts a digital employee from the chat mention flow, the model can call the `skill` loader with `{"name":"list"}` and receive `skill "list" is unknown or no longer available`. This makes configured skills appear ineffective and indicates that the session's model-visible skill catalog is missing, stale, or ambiguous.

## What Changes

- Ensure every eligible digital employee session publishes the exact, currently authorized skill catalog before the first model request.
- Keep the model-facing `skill` loader contract explicit: it loads one exact catalog name and does not act as a list operation.
- Reconcile the catalog after preset composition and capability restrictions so marketplace and local skills visible to the employee are represented accurately.
- Add diagnostics and keyless Web/assembled tests that distinguish catalog listing from skill loading and prevent `skill({ name: "list" })` regressions.
- Preserve ordinary chat mention routing and reject unavailable or no-longer-authorized skills without silently loading another skill.

## Capabilities

### New Capabilities

### Modified Capabilities

- `template-skill-catalog`: Define the catalog and loader behavior for digital employee scopes, including exact-name visibility and refresh.
- `digital-employee-chat-mentions`: Require a newly routed employee session to expose its authorized skill catalog and load the selected skill through the normal model tool path.

## Impact

- Affects `dsh-tool-skill`, digital employee Agent composition, session prompt assembly, and the Web chat/runtime integration.
- Adds focused unit, fixture, snapshot, and Web E2E coverage.
- No public RPC rename is expected; the existing `skill.list` catalog RPC remains separate from the model-facing `skill` loader tool.
