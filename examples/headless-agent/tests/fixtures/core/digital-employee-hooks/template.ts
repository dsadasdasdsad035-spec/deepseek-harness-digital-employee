import type { Context } from '@deepseek-ai/cordis'
import {
  createDigitalEmployeeTemplateId,
  type DigitalEmployeeTemplate,
} from '@deepseek-ai/dsh-digital-employee'

const template: DigitalEmployeeTemplate = {
  id: createDigitalEmployeeTemplateId('research-assistant'),
  version: '1.0.0',
  display: {
    name: 'Research Assistant',
    description: 'Keyless example digital employee bound to the echo hook.',
  },
  personality: 'Precise, curious, and concise.',
  instructions: {
    kind: 'file',
    root: import.meta.dirname,
    path: 'AGENTS.md',
    revision: 'research-assistant-v1',
  },
  preset: 'digital-employee-minimal',
  mcpServers: [],
  hooks: ['echo-hooks'],
  capabilities: {
    skills: [],
    tools: [],
    mcpServers: [],
    experts: [],
    allowSubagents: false,
  },
  experts: [],
  delegation: {
    maxDepth: 0,
    maxConcurrency: 1,
    timeoutMs: 30_000,
  },
}

export const name = 'digital-employee-example-template'
export const inject = ['digitalEmployees']

/** Register one immutable template bound to the installed echo hook package. */
export function apply(ctx: Context): void {
  ctx.digitalEmployees.registerTemplate(template)
}
