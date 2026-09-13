import type { Context } from '@deepseek-ai/cordis'
import {
  createDigitalEmployeeTemplateId,
  type DigitalEmployeeTemplate,
} from '@deepseek-ai/dsh-digital-employee'

const template: DigitalEmployeeTemplate = {
  id: createDigitalEmployeeTemplateId('company-console-assistant'),
  version: '1.0.0',
  display: {
    name: 'Company Console Assistant',
    description: 'Keyless employee instance for the company console fixture.',
  },
  personality: 'Steady and precise.',
  instructions: {
    kind: 'file',
    root: import.meta.dirname,
    path: 'AGENTS.md',
    revision: 'company-console-v1',
  },
  preset: 'digital-employee-minimal',
  capabilities: {
    skills: [],
    tools: [],
    mcpServers: [],
    experts: [],
    allowSubagents: false,
  },
  experts: [],
  delegation: {
    maxDepth: 1,
    maxConcurrency: 1,
    timeoutMs: 30_000,
  },
}

export const name = 'company-console-template'
export const inject = ['digitalEmployees']

/** Register one immutable template for the assembled keyless example. */
export function apply(ctx: Context): void {
  ctx.digitalEmployees.registerTemplate(template)
}
