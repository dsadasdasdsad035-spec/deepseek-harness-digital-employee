import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { Context } from '@deepseek-ai/cordis'
import DigitalEmployees from '@deepseek-ai/dsh-digital-employee'
import {
  apply as applyDigitalEmployeeFile,
  inject as digitalEmployeeFileInject,
} from '@deepseek-ai/dsh-digital-employee-file'
import { SessionId } from '@deepseek-ai/dsh-session'
import { afterEach, describe, expect, it } from 'vitest'
import { apply, PROJECT_MANAGER_TEMPLATE, PROJECT_MEMORY_SEED } from '../src/index.ts'

describe('project-manager test memory', () => {
  const homes: string[] = []

  afterEach(async () => {
    await Promise.all(homes.splice(0).map(async home => await rm(home, { recursive: true, force: true })))
  })

  it('persists the Atlas seed for its employee only', async () => {
    const home = await mkdtemp(join(tmpdir(), 'project-manager-memory-'))
    homes.push(home)
    const ctx = new Context()
    await ctx.plugin(DigitalEmployees)
    apply(ctx)
    await ctx.plugin({ inject: digitalEmployeeFileInject, apply: applyDigitalEmployeeFile }, {
      path: join(home, 'digital-employees.json'),
    })
    const grants = PROJECT_MANAGER_TEMPLATE.capabilities
    const primary = await ctx.digitalEmployees.create({
      templateId: PROJECT_MANAGER_TEMPLATE.id,
      templateVersion: PROJECT_MANAGER_TEMPLATE.version,
      displayName: 'Atlas PM',
      grants,
    })
    const other = await ctx.digitalEmployees.create({
      templateId: PROJECT_MANAGER_TEMPLATE.id,
      templateVersion: PROJECT_MANAGER_TEMPLATE.version,
      displayName: 'Other PM',
      grants,
    })

    const decision = await ctx.digitalEmployees.promoteMemory({
      employeeId: primary.id,
      ...PROJECT_MEMORY_SEED,
      provenance: { ...PROJECT_MEMORY_SEED.provenance, sessionId: SessionId('atlas-memory-seed') },
    })

    expect(decision.kind).toBe('accepted')
    await expect(ctx.digitalEmployees.queryMemory({
      employeeId: primary.id,
      text: 'rollback',
      scopes: ['long-term'],
      limit: 3,
    })).resolves.toEqual([expect.objectContaining({ content: PROJECT_MEMORY_SEED.content })])
    await expect(ctx.digitalEmployees.queryMemory({
      employeeId: other.id,
      text: 'rollback',
      scopes: ['long-term'],
      limit: 3,
    })).resolves.toEqual([])
    await ctx.fiber.dispose()
  })
})
