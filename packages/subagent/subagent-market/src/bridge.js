/**
 * Employee-scoped mounting of installed subagent persona packages: one
 * `subagent__<id>` delegation provider per declared persona, composed by the
 * fixed in-process spawn driver. Packages never ship provider code.
 * @module
 */
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
/**
 * Mount one employee's subagent persona bindings: register a
 * `subagent__<id>` provider per declared persona that delegates to the fixed
 * spawn driver with the persona's instructions and tool allowlist. Only the
 * mounting employee's composition sees the provider.
 * @param agentCtx - Agent scope context providing `subagents`.
 * @param bindings - Installed packages and their personas bound to this employee.
 * @returns disposer unregistering the providers.
 */
export function mountEmployeeSubagents(agentCtx, bindings, _options = {}) {
    if (bindings.length === 0)
        return () => { };
    const registry = agentCtx.get('subagents');
    if (registry === undefined) {
        throw new Error('subagent-market bridge requires the subagents registry in the mounting scope');
    }
    const spawn = registry.getProvider('spawn');
    if (spawn === undefined) {
        throw new Error('subagent-market bridge requires the "spawn" provider');
    }
    const disposers = [];
    for (const { pkg, persona } of bindings) {
        const providerName = `subagent__${persona.id}`;
        const instructions = readFile(join(pkg.directory, persona.instructions), 'utf8');
        const provider = {
            name: providerName,
            capabilities: { outputSchema: false, depthLimit: true, toolFilter: true, persona: true },
            inheritsParentContext: false,
            start: async (request) => {
                const text = await instructions;
                return await spawn.start({
                    ...request,
                    persona: text,
                    ...persona.tools.length > 0 ? { toolFilter: { allow: [...persona.tools] } } : {},
                });
            },
        };
        disposers.push(registry.registerProvider(provider));
    }
    return () => {
        for (const dispose of disposers.reverse())
            dispose();
    };
}
//# sourceMappingURL=bridge.js.map