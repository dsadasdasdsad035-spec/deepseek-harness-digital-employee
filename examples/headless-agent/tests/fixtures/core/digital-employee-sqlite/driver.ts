#!/usr/bin/env node

import type { Context } from '@deepseek-ai/cordis'
import { boot, resolveConfigPath } from '@deepseek-ai/dsh-app-boot'
import { createDigitalEmployeeTemplateId } from '@deepseek-ai/dsh-digital-employee'
import { SessionId } from '@deepseek-ai/dsh-session'

const configPath = process.argv[2]
if (configPath === undefined) throw new Error('digital employee sqlite driver requires a config path')

function acceptance(stage: string, data: Readonly<Record<string, unknown>>): void {
  process.stdout.write(`${JSON.stringify({ type: 'acceptance', stage, ...data })}\n`)
}

let ctx: Context | undefined
try {
  ctx = await boot('digital-employee-sqlite-e2e', resolveConfigPath(configPath, undefined))
  const instance = await ctx.digitalEmployees.create({
    templateId: createDigitalEmployeeTemplateId('research-assistant'),
    templateVersion: '1.0.0',
    displayName: 'Sqlite Ada',
    grants: {
      skills: [],
      tools: [],
      mcpServers: [],
      experts: [],
      allowSubagents: false,
    },
  })
  const activated = await ctx.digitalEmployees.transition(instance.id, 'active')
  const decision = await ctx.digitalEmployees.promoteMemory({
    employeeId: instance.id,
    content: 'The sqlite durable store holds this launch note.',
    tags: ['sqlite'],
    sensitive: false,
    provenance: {
      sessionId: SessionId('digital-employee-sqlite-session'),
      source: 'fixture',
      recordedAt: '2026-09-16T00:00:00.000Z',
    },
  })
  if (decision.kind === 'rejected') throw new Error(decision.reason)
  const recalled = await ctx.digitalEmployees.queryMemory({
    employeeId: instance.id,
    text: 'sqlite',
    scopes: ['long-term'],
    limit: 5,
  })
  acceptance('sqlite-provider', {
    displayName: instance.displayName,
    state: activated.state,
    promoted: decision.kind === 'accepted',
    recalled: recalled.length,
  })
} finally {
  await ctx?.fiber.dispose()
}
