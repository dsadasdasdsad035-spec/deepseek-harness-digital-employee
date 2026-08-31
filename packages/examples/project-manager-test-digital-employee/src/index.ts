/**
 * Offline deterministic project-manager digital employee template.
 * @module @deepseek-ai/dsh-project-manager-test-digital-employee
 */

import type { Context } from '@deepseek-ai/cordis'
import { resolve } from 'node:path'
import {
  createExpertId,
  createDigitalEmployeeTemplateId,
  type DigitalEmployeeTemplate,
} from '@deepseek-ai/dsh-digital-employee'
import { PROJECT_SKILLS } from './skills.ts'

const ROOT = resolve(import.meta.dirname, '..')

/** Bounded package-owned memory seed applied by isolated fixture compositions. */
export const PROJECT_MEMORY_SEED = {
  content: 'Atlas delivery uses a staged release with an explicit rollback owner.',
  tags: ['atlas', 'delivery'],
  sensitive: false,
  provenance: {
    source: 'project-manager-test-seed',
    recordedAt: '2026-08-30T00:00:00.000Z',
  },
} as const

/** Original immutable fixture revision retained for existing employee instances. */
export const PROJECT_MANAGER_TEMPLATE_V1: DigitalEmployeeTemplate = {
  id: createDigitalEmployeeTemplateId('project-manager-test'),
  version: '1.0.0',
  display: {
    name: 'Project Manager (Test)',
    description: 'Offline project-management fixture with deterministic project data.',
  },
  personality: 'Methodical, evidence-driven, and concise about delivery risk.',
  instructions: {
    kind: 'file',
    root: ROOT,
    path: 'AGENTS.md',
    revision: 'project-manager-test-v1',
  },
  preset: 'standard',
  mcpServers: [{
    id: 'project-data',
    transport: 'stdio',
    command: process.execPath,
    args: [resolve(ROOT, 'project-data-mcp.mjs')],
    env: {},
    envCredentials: {},
    cwd: ROOT,
    failOnStartupError: true,
  }],
  capabilities: {
    skills: PROJECT_SKILLS.map(skill => skill.name),
    tools: ['project_board', 'project_document'],
    mcpServers: ['project-data'],
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

/** Current complete fixture revision with deterministic memory and risk review delegation. */
export const PROJECT_MANAGER_TEMPLATE: DigitalEmployeeTemplate = {
  ...PROJECT_MANAGER_TEMPLATE_V1,
  version: '1.1.0',
  instructions: {
    ...PROJECT_MANAGER_TEMPLATE_V1.instructions,
    revision: 'project-manager-test-v1.1',
  },
  memorySeeds: [PROJECT_MEMORY_SEED],
  capabilities: {
    ...PROJECT_MANAGER_TEMPLATE_V1.capabilities,
    experts: [createExpertId('risk-reviewer')],
  },
  experts: [{
    id: createExpertId('risk-reviewer'),
    name: 'Risk Reviewer',
    responsibility: 'Review delivery risks, owners, mitigations, and review points.',
    instructions: {
      kind: 'file',
      root: ROOT,
      path: 'experts/risk-reviewer/AGENTS.md',
      revision: 'project-manager-risk-reviewer-v1',
    },
    modelSettings: {},
    capabilities: {
      skills: ['risk-review'],
      tools: ['project_board', 'project_document'],
      mcpServers: ['project-data'],
      experts: [],
      allowSubagents: false,
    },
    memoryAccess: ['long-term'],
    delegation: {
      mode: 'one-shot',
      maxDepth: 0,
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

export const name = 'project-manager-test-digital-employee'
export const inject = ['digitalEmployees']

/** Register the immutable project-manager test template for this plugin lifetime. */
export function apply(ctx: Context): void {
  ctx.digitalEmployees.registerTemplate(PROJECT_MANAGER_TEMPLATE_V1)
  ctx.digitalEmployees.registerTemplate(PROJECT_MANAGER_TEMPLATE)
}

export { PROJECT_SKILLS } from './skills.ts'
