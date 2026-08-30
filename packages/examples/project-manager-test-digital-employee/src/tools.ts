/**
 * Deterministic project-management tools for the fixture template.
 * @module @deepseek-ai/dsh-project-manager-test-digital-employee/tools
 */

import type { Context } from '@deepseek-ai/cordis'
import { defineTool } from '@deepseek-ai/dsh-tools'

const PROJECT_BOARD = {
  project: 'Atlas',
  milestones: [
    { name: 'Discovery', owner: 'Mina', status: 'complete' },
    { name: 'Pilot', owner: 'Chen', status: 'at-risk' },
  ],
  risks: [{ id: 'R-1', owner: 'Chen', summary: 'Pilot acceptance criteria are pending.' }],
}

const PROJECT_DOCUMENT = {
  project: 'Atlas',
  decision: 'Use a staged release with an explicit rollback owner.',
  nextReview: '2026-09-04',
}

export const name = 'project-manager-test-tools'
export const inject = ['tools']

/** Register project tools that return only package-owned static fixture data. */
export function apply(ctx: Context): void {
  ctx.tools.register(defineTool({
    name: 'project_board',
    description: 'Read the deterministic Atlas project board.',
    parameters: {},
    output: {
      schema: {
        type: 'object',
        additionalProperties: false,
        properties: {
          project: { type: 'string', required: true },
          milestones: { type: 'array', required: true, items: { type: 'object', additionalProperties: true, properties: {} } },
          risks: { type: 'array', required: true, items: { type: 'object', additionalProperties: true, properties: {} } },
        },
      },
      render: () => [{ type: 'text', text: JSON.stringify(PROJECT_BOARD) }],
    },
    async execute() {
      return PROJECT_BOARD
    },
  }))
  ctx.tools.register(defineTool({
    name: 'project_document',
    description: 'Read the deterministic Atlas project decision document.',
    parameters: {},
    output: {
      schema: {
        type: 'object',
        additionalProperties: false,
        properties: {
          project: { type: 'string', required: true },
          decision: { type: 'string', required: true },
          nextReview: { type: 'string', required: true },
        },
      },
      render: () => [{ type: 'text', text: JSON.stringify(PROJECT_DOCUMENT) }],
    },
    async execute() {
      return PROJECT_DOCUMENT
    },
  }))
}
