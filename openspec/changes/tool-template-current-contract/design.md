## Context

`defineTool` now requires `output: { schema, render }` and `execute` returns the canonical value; `packages/core/tools/src/schema.ts` reads `options.output.render` unconditionally. The template plugin still used the pre-contract shape (`execute` returning content blocks, no `output`), and every marketplace suite replaces the `tools` service with a permissive mock, so the drift could not fail a test.

## Goals / Non-Goals

**Goals:**

- The distributed template registers and executes against the real registry.
- A test composes the real registry with the template plugin so contract drift fails at test time.

**Non-Goals:**

- No change to `defineTool`, the registry, marketplace services, or the unsigned override.
- No migration of already-installed stale template packages; operators remove and reinstall them.

## Decisions

### The example returns a string value and renders one text block

`marketplace_echo` declares `output.schema: { type: 'string' }`, `execute` resolves `args.text`, and `render` emits one text content block from that value. This is the smallest honest demonstration of the contract's value/render split without importing presentation helpers into the template.

### The regression test mounts the real registry, not a mock

The new activation test loads the actual Tool registry plugin from the workspace, imports the checked-in template plugin source, applies it to that context, and invokes the registered tool through the registry. Mock-based gateway suites stay unchanged; this test is the single place where the distributed artifact meets the real contract.

## Risks / Trade-offs

- [A future contract change re-breaks the template] → the real-registry test fails first, naming the contract mismatch.
- [Users hold stale installed copies] → the template README states the remove-then-reinstall step; marketplace uninstall is the supported path.
