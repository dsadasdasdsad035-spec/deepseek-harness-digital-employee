## Why

The Tool publisher template's example plugin predates the current `defineTool` contract: it registers without the required `output: { schema, render }`, so the moment an unsigned install is activated (now the Web bundle default), boot crashes with `Cannot read properties of undefined (reading 'render')`. Existing marketplace tests mount mock Tool registries, so template-plugin drift from the real registration contract was invisible.

## What Changes

- Update the Tool template's `plugin/index.js` to the current contract: declare `output.schema` and a pure `output.render`, return the canonical value from `execute` instead of content blocks, and keep the example minimal.
- Regenerate the checked-in `tool-market-template.zip` from the repaired source.
- Add a real-registry activation test that registers the template plugin against the actual Tool registry service, so future registration-contract changes break the template in tests instead of at Host boot.
- Note the stale-install recovery step in the Tool template README (remove a previously installed template package before reinstalling the repaired template).

## Capabilities

### New Capabilities

- `marketplace-tool-template`: The downloadable Tool publisher template ships an example plugin that satisfies the current Tool registration contract and is proven by activation against the real registry.

### Modified Capabilities

<!-- tool-marketplace and marketplace-publisher-toolchain behavior is unchanged; this repairs the template artifact they distribute. -->

## Impact

- `packages/client/ui-skill-market/templates/template-tool/plugin/index.js` and the Tool template READMEs (both locales).
- Regenerated `apps/web/public/tool-market-template.zip`.
- A new activation test in `packages/tool/tool-market/tests` composing the real Tool registry plugin.
