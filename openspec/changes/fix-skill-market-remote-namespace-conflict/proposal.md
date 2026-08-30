## Why

The Web Host cannot start after the skill marketplace Remote is mounted because the generated `skillMarket/install` operation collides with an internal method on Typert's client namespace service. The marketplace must compose through `@deepseek-ai/dsh-api-remotes` without reserving ordinary business operation names before the feature can be used in the assembled application.

## What Changes

- Correct the generic client namespace implementation so `install` can be mounted as a generated business operation without colliding with namespace bookkeeping.
- Preserve the typed `skillMarket.banner`, `skillMarket.install`, `skillMarket.list`, and `skillMarket.uninstall` client surface over the shared `/api` carrier.
- Add regression coverage that loads the real Web Host plugin composition and proves marketplace calls register without method-versus-namespace conflicts.
- Refresh generated Typert artifacts and affected package wiring from the corrected source model.

## Capabilities

### New Capabilities

- `skill-market-remote-composition`: Defines conflict-free registration and availability of the skill marketplace namespace through the assembled Web Host client API.

### Modified Capabilities

None.

## Impact

The change affects the skill marketplace Host and generated Remote contributions, `@deepseek-ai/dsh-api-remotes` client composition, Web Host assembly tests, and generated Typert artifacts. The public marketplace method names and shared `/api` transport remain unchanged.
