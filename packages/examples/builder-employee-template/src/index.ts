/**
 * Builder digital employee template: interviews users and assembles new
 * digital employees from market assets through scoped authoring tools.
 * @module @deepseek-ai/dsh-builder-employee-template
 */

import { resolve } from 'node:path'
import type { Context } from '@deepseek-ai/cordis'
import {
  createDigitalEmployeeTemplateId,
  createExpertId,
  type DigitalEmployeeTemplate,
} from '@deepseek-ai/dsh-digital-employee'
import { registerAuthoringTools } from './authoring-tools.ts'

const ROOT = resolve(import.meta.dirname, '..')

export const REVIEW_EXPERT_ID = createExpertId('requirements-reviewer')
export const TEST_EXPERT_ID = createExpertId('dry-run-tester')
export const PACKAGE_EXPERT_ID = createExpertId('packager')

const BUILDER_TEMPLATE: DigitalEmployeeTemplate = {
  id: createDigitalEmployeeTemplateId('builder-employee'),
  version: '1.0.0',
  display: {
    name: 'Employee Builder',
    description: 'Interviews you and assembles new digital employees from installed market assets.',
  },
  personality: 'Structured, curious about requirements, and careful about capability boundaries.',
  instructions: {
    kind: 'file',
    root: ROOT,
    path: 'AGENTS.md',
    revision: 'builder-employee-v1',
  },
  preset: 'standard',
  hooks: [],
  workflows: [],
  subagents: [],
  capabilities: {
    skills: [],
    tools: [
      'builder_list_assets', 'builder_create_draft', 'builder_validate_draft',
      'builder_preview_draft', 'builder_publish_draft',
    ],
    mcpServers: [],
    experts: [REVIEW_EXPERT_ID, TEST_EXPERT_ID, PACKAGE_EXPERT_ID],
    allowSubagents: true,
  },
  experts: [
    {
      id: REVIEW_EXPERT_ID,
      name: 'Requirements Reviewer',
      responsibility: 'Review the capability plan for scope creep, authority escalation, or missing assets.',
      instructions: { kind: 'file', root: ROOT, path: 'experts/requirements-reviewer.md', revision: 'reviewer-v1' },
      modelSettings: {},
      capabilities: { skills: [], tools: ['builder_list_assets'], mcpServers: [], experts: [], allowSubagents: false },
      memoryAccess: ['task'],
      delegation: { mode: 'one-shot', maxDepth: 1, maxConcurrency: 1, timeoutMs: 30_000 },
    },
    {
      id: TEST_EXPERT_ID,
      name: 'Dry-Run Tester',
      responsibility: 'Smoke-test the draft via the preview session before publication.',
      instructions: { kind: 'file', root: ROOT, path: 'experts/dry-run-tester.md', revision: 'tester-v1' },
      modelSettings: {},
      capabilities: { skills: [], tools: ['builder_validate_draft', 'builder_preview_draft'], mcpServers: [], experts: [], allowSubagents: false },
      memoryAccess: [],
      delegation: { mode: 'one-shot', maxDepth: 1, maxConcurrency: 1, timeoutMs: 60_000 },
    },
    {
      id: PACKAGE_EXPERT_ID,
      name: 'Packager',
      responsibility: 'Publish the validated draft and report the template identity.',
      instructions: { kind: 'file', root: ROOT, path: 'experts/packager.md', revision: 'packager-v1' },
      modelSettings: {},
      capabilities: { skills: [], tools: ['builder_publish_draft'], mcpServers: [], experts: [], allowSubagents: false },
      memoryAccess: [],
      delegation: { mode: 'one-shot', maxDepth: 1, maxConcurrency: 1, timeoutMs: 30_000 },
    },
  ],
  delegation: { maxDepth: 1, maxConcurrency: 2, timeoutMs: 60_000 },
}

export const name = 'builder-employee-template'
export const inject = ['digitalEmployees', 'tools']

/** Register the builder template and its scoped authoring tools. */
export function apply(ctx: Context): void {
  ctx.digitalEmployees.registerTemplate(BUILDER_TEMPLATE)
  registerAuthoringTools(ctx, BUILDER_TEMPLATE.preset)
}
