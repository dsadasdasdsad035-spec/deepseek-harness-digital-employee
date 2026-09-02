import { Context } from '@deepseek-ai/cordis'
import { existsSync } from 'node:fs'
import { resolve } from 'node:path'
import DigitalEmployees from '@deepseek-ai/dsh-digital-employee'
import { describe, expect, it } from 'vitest'
import { apply, PROJECT_MANAGER_TEMPLATE, PROJECT_MEMORY_SEED, PROJECT_SKILLS } from '../src/index.ts'

describe('project-manager test digital employee', () => {
  it('registers the complete deterministic project-manager capability set', async () => {
    const ctx = new Context()
    await ctx.plugin(DigitalEmployees)
    apply(ctx)

    const template = ctx.digitalEmployees.getTemplate(
      PROJECT_MANAGER_TEMPLATE.id,
      PROJECT_MANAGER_TEMPLATE.version,
    )

    expect(template).toEqual(PROJECT_MANAGER_TEMPLATE)
    expect(PROJECT_SKILLS.map(skill => skill.name)).toEqual([
      'project-planning',
      'risk-review',
      'status-reporting',
    ])
    expect(template?.capabilities).toEqual({
      skills: PROJECT_SKILLS.map(skill => skill.name),
      tools: ['project_board', 'project_document'],
      mcpServers: ['project-data'],
      experts: [expect.anything()],
      allowSubagents: true,
    })
    expect(template?.experts).toEqual([expect.objectContaining({
      name: 'Risk Review Expert',
      responsibility: expect.stringContaining('delivery risk'),
      capabilities: {
        skills: ['risk-review'],
        tools: ['project_document'],
        mcpServers: ['project-data'],
        experts: [],
        allowSubagents: false,
      },
      memoryAccess: ['task', 'long-term'],
    })])
    expect(template?.mcpServers).toEqual([expect.objectContaining({
      id: 'project-data',
      transport: 'stdio',
      env: {},
      envCredentials: {},
    })])
    expect(PROJECT_MEMORY_SEED).toEqual(expect.objectContaining({
      content: expect.stringContaining('Atlas'),
      tags: ['atlas', 'delivery'],
      sensitive: false,
    }))
    expect(existsSync(resolve(PROJECT_MANAGER_TEMPLATE.instructions.root, PROJECT_MANAGER_TEMPLATE.instructions.path))).toBe(true)
    expect(existsSync(resolve(PROJECT_MANAGER_TEMPLATE.instructions.root, 'src/project-data-mcp.ts'))).toBe(true)
  })
})
