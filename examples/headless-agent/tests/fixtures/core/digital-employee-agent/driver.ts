#!/usr/bin/env node

import type { Context } from '@deepseek-ai/cordis'
import { boot, resolveConfigPath } from '@deepseek-ai/dsh-app-boot'
import {
  createDigitalEmployeeSubmissionId,
  createDigitalEmployeeTemplateId,
  createExpertId,
  projectDigitalEmployeeOwnership,
  type DigitalEmployeeAuthority,
} from '@deepseek-ai/dsh-digital-employee'
import { SessionId, type SessionEvent } from '@deepseek-ai/dsh-session'
import type {} from '@deepseek-ai/dsh-host-digital-employee-management'
import { WorkspaceId } from '@deepseek-ai/dsh-workspace'

const configPath = process.argv[2]
if (configPath === undefined) throw new Error('digital employee driver requires a config path')

const reviewerId = createExpertId('reviewer')
const taskText = 'Run the keyless employee task.'
const employeeAuthority: DigitalEmployeeAuthority = {
  skills: [],
  tools: [],
  mcpServers: [],
  experts: [reviewerId],
  allowSubagents: false,
}

function acceptance(stage: string, data: Readonly<Record<string, unknown>>): void {
  process.stdout.write(`${JSON.stringify({ type: 'acceptance', stage, ...data })}\n`)
}

let ctx: Context | undefined
try {
  ctx = await boot('digital-employee-agent-e2e', resolveConfigPath(configPath, undefined))
  const instance = await ctx.digitalEmployees.create({
    templateId: createDigitalEmployeeTemplateId('research-assistant'),
    templateVersion: '1.0.0',
    displayName: 'Ada',
    grants: employeeAuthority,
  })
  acceptance('employee-created', { displayName: instance.displayName, state: instance.state })
  await ctx.digitalEmployees.transition(instance.id, 'active')

  const rootSessionId = SessionId('digital-employee-root')
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
    submissionId: createDigitalEmployeeSubmissionId('digital-employee-submission'),
    content: [{ type: 'text', text: taskText }],
  }, new AbortController().signal)
  try {
    await turnSettled.promise
  } finally {
    disposeListener()
  }
  acceptance('chat-started', {
    sessionId: started.sessionId,
    submissionId: started.submissionId,
  })
  const agent = ctx.agents.get(started.sessionId)
  if (agent === undefined) throw new Error('accepted digital employee Session has no live Agent')

  const ownership = projectDigitalEmployeeOwnership(agent.session.events)
  if (ownership === undefined) throw new Error('accepted digital employee Session has no durable ownership')
  acceptance('ownership-recorded', {
    employeeIdMatches: ownership.employeeId === instance.id,
    templateId: ownership.templateId,
    templateVersion: ownership.templateVersion,
    compositionIdRecorded: String(ownership.compositionId).startsWith('sha256:'),
  })
  const firstMessage = agent.session.events.find(event =>
    event.type === 'user/message' && event.data.id === started.messageId)
  if (firstMessage?.type !== 'user/message') {
    throw new Error('accepted digital employee Session has no matching first user message')
  }
  acceptance('first-message-recorded', {
    messageIdMatches: firstMessage.data.id === started.messageId,
    content: firstMessage.data.content
      .filter(block => block.type === 'text')
      .map(block => block.text)
      .join(''),
  })

  const expert = await ctx.digitalEmployeeAgent.delegateToExpert({
    employeeId: instance.id,
    expertId: reviewerId,
    provider: 'digital-employee-fixture',
    parent: agent,
    parentAuthority: {
      capabilities: employeeAuthority,
      delegation: { maxDepth: 1, maxConcurrency: 1, timeoutMs: 30_000 },
      depth: 0,
      activeDelegations: 0,
    },
    prompt: [{ type: 'text', text: 'Review the keyless task.' }],
    signal: new AbortController().signal,
  })
  if (expert.mode !== 'one-shot') throw new Error('fixture reviewer must be one-shot')
  const expertResult = await expert.run.result
  acceptance('expert-delegated', {
    expertId: reviewerId,
    mode: expert.mode,
    result: expertResult.output.map(block => block.type === 'text' ? block.text : '').join(''),
  })
  const memory = await ctx.digitalEmployeeAgent.promoteMemory(agent, {
    employeeId: instance.id,
    content: 'Use staged releases.',
    tags: ['release'],
    sensitive: false,
    provenance: {
      sessionId: agent.session.id,
      source: 'expert-candidate',
      recordedAt: '2026-08-29T00:00:00.000Z',
    },
  })
  acceptance('memory-decision', {
    decision: memory.kind,
    content: 'Use staged releases.',
  })
  try {
    await ctx.digitalEmployeeAgent.delegateToExpert({
      employeeId: instance.id,
      expertId: reviewerId,
      provider: 'digital-employee-fixture',
      parent: agent,
      parentAuthority: {
        capabilities: employeeAuthority,
        delegation: { maxDepth: 1, maxConcurrency: 1, timeoutMs: 30_000 },
        depth: 1,
        activeDelegations: 0,
      },
      prompt: [{ type: 'text', text: 'Attempt an over-depth delegation.' }],
      signal: new AbortController().signal,
    })
  } catch (error: unknown) {
    const reason = error instanceof Error && error.message.includes('maximum depth')
      ? 'maximum depth'
      : String(error)
    acceptance('capability-denied', { expertId: reviewerId, reason })
  }
  for (const event of agent.session.events) {
    process.stdout.write(`${JSON.stringify({
      type: 'session_event',
      sessionId: agent.session.id,
      event,
    })}\n`)
  }
  process.stdout.write(`${JSON.stringify({
    type: 'result',
    sessionId: agent.session.id,
    output,
  })}\n`)
  await ctx.digitalEmployees.transition(instance.id, 'inactive')
  acceptance('lifecycle-transition', { state: 'inactive' })
  acceptance('final-result', { output })
} finally {
  await ctx?.fiber.dispose()
}
