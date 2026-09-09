import type { Context } from '@deepseek-ai/cordis'
import { createDigitalEmployeeTemplateId, type DigitalEmployeeTemplate } from '@deepseek-ai/dsh-digital-employee'

const template: DigitalEmployeeTemplate = {
  id: createDigitalEmployeeTemplateId('wf-sa-assistant'),
  version: '1.0.0',
  display: { name: 'WF+SA Assistant', description: 'Binds workflow and subagent packages.' },
  personality: 'Efficient.',
  instructions: { kind: 'file', root: import.meta.dirname, path: 'AGENTS.md', revision: 'v1' },
  preset: 'digital-employee-minimal',
  workflows: ['noop-workflows'],
  subagents: ['reviewer-subagents'],
  capabilities: { skills: [], tools: [], mcpServers: [], experts: [], allowSubagents: false },
  experts: [],
  delegation: { maxDepth: 0, maxConcurrency: 1, timeoutMs: 30_000 },
}
export const name = 'digital-employee-example-template'
export const inject = ['digitalEmployees']
export function apply(ctx: Context): void { ctx.digitalEmployees.registerTemplate(template) }
