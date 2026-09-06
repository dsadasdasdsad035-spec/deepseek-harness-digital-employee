#!/usr/bin/env node
/**
 * Builder employee assembled snapshot: the builder template registers, its
 * authoring tools mount behind the management gateway, and a chat task with
 * the builder drives the tool surface through the real agent loop.
 */
import type { Context } from '@deepseek-ai/cordis'
import { boot, resolveConfigPath } from '@deepseek-ai/dsh-app-boot'
import {
  createDigitalEmployeeSubmissionId,
  createDigitalEmployeeTemplateId,
  type DigitalEmployeeAuthority,
} from '@deepseek-ai/dsh-digital-employee'
import { SessionId, type SessionEvent } from '@deepseek-ai/dsh-session'
import type {} from '@deepseek-ai/dsh-host-digital-employee-management'
import { WorkspaceId } from '@deepseek-ai/dsh-workspace'

const configPath = process.argv[2]
if (configPath === undefined) throw new Error('builder employee driver requires a config path')
import { fileURLToPath } from 'node:url'
const fixtureDir = fileURLToPath(new URL('.', import.meta.url))
process.env.DSH_DIGITAL_EMPLOYEE_PRESET_ROOT ??= `${fixtureDir}presets`

const authority: DigitalEmployeeAuthority = {
  skills: [], tools: [], mcpServers: [], experts: [], allowSubagents: false,
}

function acceptance(stage: string, data: Readonly<Record<string, unknown>>): void {
  process.stdout.write(`${JSON.stringify({ type: 'acceptance', stage, ...data })}\n`)
}

let ctx: Context | undefined
try {
  ctx = await boot('builder-employee-snapshot', resolveConfigPath(configPath, undefined))

  const builderTemplate = ctx.digitalEmployees.getTemplate(createDigitalEmployeeTemplateId('builder-employee'), '1.0.0')
  acceptance('template-registered', { found: builderTemplate !== undefined })

  const toolNames = ctx.tools.schemas().map(tool => tool.name)
  acceptance('authoring-tools', {
    count: toolNames.filter(name => name.startsWith('builder_')).length,
    list: toolNames.filter(name => name.startsWith('builder_')).sort(),
  })

  const instance = await ctx.digitalEmployees.create({
    templateId: createDigitalEmployeeTemplateId('builder-employee'),
    templateVersion: '1.0.0',
    displayName: 'Builder',
    grants: authority,
  })
  await ctx.digitalEmployees.transition(instance.id, 'active')
  acceptance('employee-created', { displayName: instance.displayName, state: instance.state })

  const rootSessionId = SessionId('builder-employee-root')
  let output = ''
  const turnSettled = Promise.withResolvers<undefined>()
  const disposeListener = ctx.on('session/event', (session, event: SessionEvent) => {
    if (session.id !== rootSessionId) return
    if (event.type === 'assistant/message') {
      output = event.data.message.content
        .filter(block => block.type === 'text')
        .map(block => block.text)
        .join('')
    }
    if (event.type === 'turn/end') turnSettled.resolve(undefined)
  })
  const started = await ctx.digitalEmployeeManagement.startChat({
    employeeId: instance.id,
    workspaceId: WorkspaceId('digital-employee-management-workspace'),
    sessionId: rootSessionId,
    submissionId: createDigitalEmployeeSubmissionId('builder-submission'),
    content: [{ type: 'text', text: 'List the available assets for building an employee.' }],
  }, new AbortController().signal)
  try {
    await turnSettled.promise
  } finally {
    disposeListener()
  }
  acceptance('chat-started', { sessionId: started.sessionId })
  acceptance('final-result', { output })
} finally {
  await ctx?.fiber.dispose()
}
