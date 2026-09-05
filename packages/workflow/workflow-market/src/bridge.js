/**
 * Employee-scoped mounting of installed workflow packages: one model-facing
 * `workflow__<id>` tool per declared workflow, executed by the existing
 * workflow engine with the package's script.
 * @module
 */
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
/**
 * Mount one employee's workflow bindings: register a `workflow__<id>` tool per
 * declared workflow that starts the packaged script on the workflow engine and
 * returns the run's JSON result as the tool result.
 * @param agentCtx - Agent scope context providing `tools` and `workflowEngine`.
 * @param bindings - Installed packages and their workflows bound to this employee.
 * @param options - Run options.
 * @returns disposer releasing the registered tools.
 */
export function mountEmployeeWorkflows(agentCtx, bindings, options = {}) {
    if (bindings.length === 0)
        return () => { };
    const engine = agentCtx.get('workflowEngine');
    const tools = agentCtx.get('tools');
    if (engine === undefined || tools === undefined) {
        throw new Error('workflow-market bridge requires workflowEngine and tools in the mounting scope');
    }
    const disposers = [];
    for (const { pkg, workflow } of bindings) {
        const toolName = `workflow__${workflow.id}`;
        const dispose = tools.register({
            name: toolName,
            description: workflow.description,
            parameters: {
                input: {
                    type: 'string',
                    required: false,
                    description: 'Optional JSON input exposed to the workflow script as `args`.',
                },
            },
            output: {
                schema: { type: 'string' },
                render: (_args, value) => [{ type: 'text', text: value }],
            },
            isConcurrencySafe: () => true,
            execute: async (args, exec) => {
                const script = await readFile(join(pkg.directory, workflow.entry), 'utf8');
                const run = engine.start({
                    script,
                    meta: { name: workflow.id, description: workflow.description },
                    args: args.input,
                    ...options.subagentProvider === undefined ? {} : { subagentProvider: options.subagentProvider },
                    parent: exec.agent,
                    signal: exec.signal,
                });
                const settled = await run.result;
                return JSON.stringify(settled.value);
            },
        });
        disposers.push(dispose);
    }
    return () => {
        for (const dispose of disposers.reverse())
            dispose();
    };
}
//# sourceMappingURL=bridge.js.map