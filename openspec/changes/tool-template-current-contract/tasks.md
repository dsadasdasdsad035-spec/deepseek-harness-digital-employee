## 1. Template repair

- [x] 1.1 Rewrite `templates/template-tool/plugin/index.js` to the current contract: `output.schema`, pure `output.render`, and `execute` returning the canonical string value.
- [x] 1.2 Regenerate `apps/web/public/tool-market-template.zip` and add the stale-install removal note to the Tool template READMEs (both locales), then re-record translation pairs.

## 2. Real-registry regression

- [x] 2.1 Add an activation test in `packages/tool/tool-market/tests` that mounts the real Tool registry, imports the checked-in template plugin, registers it, and executes the tool through the registry.
- [x] 2.2 Run the focused marketplace and template tests plus template generation; verify the host build stays green.
