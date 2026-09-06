import type { Context } from '@deepseek-ai/cordis'
import {
  createDigitalEmployeeTemplateId,
  createExpertId,
  type DigitalEmployeeTemplate,
} from '@deepseek-ai/dsh-digital-employee'

const reviewerId = createExpertId('reviewer')

const template: DigitalEmployeeTemplate = {
  id: createDigitalEmployeeTemplateId('research-assistant'),
  version: '1.0.0',
  display: {
    name: 'Research Assistant',
    description: 'Keyless example digital employee.',
  },
  personality: 'Precise, curious, and concise.',
  instructions: {
    kind: 'file',
    root: import.meta.dirname,
    path: 'AGENTS.md',
    revision: 'research-assistant-v1',
  },
  preset: 'digital-employee-minimal',
  capabilities: {
    skills: [],
    tools: [],
    mcpServers: [],
    experts: [reviewerId],
    allowSubagents: false,
  },
  experts: [{
    id: reviewerId,
    name: 'Reviewer',
    responsibility: 'Review the employee result.',
    instructions: {
      kind: 'file',
      root: import.meta.dirname,
      path: 'AGENTS.md',
      revision: 'reviewer-v1',
    },
    modelSettings: {},
    capabilities: {
      skills: [],
      tools: [],
      mcpServers: [],
      experts: [],
      allowSubagents: false,
    },
    memoryAccess: ['long-term'],
    delegation: {
      mode: 'one-shot',
      maxDepth: 1,
      maxConcurrency: 1,
      timeoutMs: 30_000,
    },
  }],
  delegation: {
    maxDepth: 1,
    maxConcurrency: 1,
    timeoutMs: 30_000,
  },
}

export const name = 'digital-employee-example-template'
export const inject = ['digitalEmployees']

/** Register one immutable template for the assembled keyless example. */
export function apply(ctx: Context): void {
  ctx.digitalEmployees.registerTemplate(template)
}
