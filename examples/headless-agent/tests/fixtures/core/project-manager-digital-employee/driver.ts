#!/usr/bin/env node

import type { Context } from '@deepseek-ai/cordis'
import { boot, resolveConfigPath } from '@deepseek-ai/dsh-app-boot'
import {
  createExpertId,
  createDigitalEmployeeTemplateId,
  type DigitalEmployeeAuthority,
} from '@deepseek-ai/dsh-digital-employee'
import { createUserMessage } from '@deepseek-ai/dsh-llm'
import { scopeOf } from '@deepseek-ai/dsh-scope'
import { SessionId, type SessionEvent } from '@deepseek-ai/dsh-session'
import type {} from '@deepseek-ai/dsh-host-digital-employee-management'

const configPath = process.argv[2]
if (configPath === undefined) throw new Error('project-manager driver requires a config path')

function acceptance(stage: string, data: Readonly<Record<string, unknown>>): void {
  process.stdout.write(`${JSON.stringify({ type: 'acceptance', stage, ...data })}\n`)
}

let ctx: Context | undefined
try {
  ctx = await boot('project-manager-digital-employee-e2e', resolveConfigPath(configPath, undefined))
  const templateId = createDigitalEmployeeTemplateId('project-manager-test')
  const template = ctx.digitalEmployees.getTemplate(templateId, '1.1.0')
  if (template === undefined) throw new Error('project-manager template was not registered')
  const templateVersions = ctx.digitalEmployeeManagement.listTemplates()
    .filter(candidate => candidate.id === templateId)
    .map(candidate => candidate.version)
    .sort()
  const instance = await ctx.digitalEmployeeManagement.create({
    templateId,
    templateVersion: template.version,
    displayName: 'Atlas PM',
    grants: template.capabilities,
  })
  const initializedMemory = await ctx.digitalEmployeeManagement.listMemory({
    employeeId: instance.id,
    text: 'rollback',
    scopes: ['long-term'],
    limit: 3,
  })
  const experts = await ctx.digitalEmployeeManagement.listExperts({ employeeId: instance.id })
  acceptance('management-created', {
    templateVersions,
    templateVersion: instance.templateVersion,
    initializedMemory: initializedMemory.map(memory => ({
      content: memory.content,
      source: memory.provenance.source,
    })),
    experts: experts.map(expert => expert.id),
  })
  await ctx.digitalEmployeeManagement.activate({ employeeId: instance.id })
  const sessionId = SessionId('project-manager-root')
  const turnSettled = Promise.withResolvers<undefined>()
  const events: SessionEvent[] = []
  const sessionEvents = new Map<SessionId, SessionEvent[]>()
  const dispose = ctx.on('session/event', (session, event: SessionEvent) => {
    const scoped = sessionEvents.get(session.id) ?? []
    scoped.push(event)
    sessionEvents.set(session.id, scoped)
    if (session.id !== sessionId) return
    events.push(event)
    if (event.type === 'turn/end') turnSettled.resolve(undefined)
  })
  const handle = await ctx.digitalEmployeeAgent.createTask({
    employeeId: instance.id,
    sessionId,
    initialMessage: createUserMessage({
      content: [{ type: 'text', text: 'Prepare the Atlas delivery plan and risk report.' }],
      source: { kind: 'user' },
    }),
    memory: {
      text: 'rollback',
      scopes: ['long-term'],
      limit: 3,
    },
  })
  const skills = handle.agent.ctx.get('skills')
  const tools = handle.agent.ctx.get('tools')
  if (skills === undefined || tools === undefined) {
    throw new Error('project-manager fixture Agent has no scoped skills or tools')
  }
  const scope = scopeOf(handle.agent.ctx)
  const visibleSkills = (await skills.list({ scope }))
    .map(skill => skill.name)
    .sort()
  const visibleTools = tools.schemas(scope)
    .map(tool => tool.name)
    .sort()
  try {
    await turnSettled.promise
    const reviewerId = createExpertId('risk-reviewer')
    const reviewerAuthority: DigitalEmployeeAuthority = {
      skills: ['risk-review'],
      tools: ['project_board', 'project_document'],
      mcpServers: ['project-data'],
      experts: [],
      allowSubagents: false,
    }
    const expert = await ctx.digitalEmployeeAgent.delegateToExpert({
      employeeId: instance.id,
      expertId: reviewerId,
      provider: 'spawn',
      parent: handle.agent,
      parentAuthority: {
        capabilities: template.capabilities,
        delegation: template.delegation,
        depth: 0,
        activeDelegations: 0,
      },
      prompt: [{ type: 'text', text: 'Review Atlas delivery risks and mitigations.' }],
      memory: { text: 'rollback', limit: 3 },
      signal: new AbortController().signal,
    })
    if (expert.mode !== 'one-shot') throw new Error('risk reviewer must run as a one-shot expert')
    const reviewerResult = await expert.run.result
    const reviewerEvents = JSON.stringify(sessionEvents.get(expert.run.id) ?? [])
    acceptance('risk-review-delegated', {
      expertId: reviewerId,
      mode: expert.mode,
      expertMcp: reviewerEvents.includes('mcp__project-data__project_snapshot'),
      result: reviewerResult.output
        .filter(block => block.type === 'text')
        .map(block => block.text)
        .join(''),
    })
    const sessionCount = sessionEvents.size
    let reason = ''
    try {
      await ctx.digitalEmployeeAgent.delegateToExpert({
        employeeId: instance.id,
        expertId: reviewerId,
        provider: 'spawn',
        parent: handle.agent,
        parentAuthority: {
          capabilities: reviewerAuthority,
          delegation: expert.delegation,
          depth: 1,
          activeDelegations: 0,
        },
        prompt: [{ type: 'text', text: 'Attempt to delegate another review.' }],
        signal: new AbortController().signal,
      })
    } catch (error: unknown) {
      reason = error instanceof Error ? error.message : String(error)
    }
    acceptance('expert-descendant-denied', {
      denied: reason !== '',
      noDescendantSession: sessionEvents.size === sessionCount,
    })
  } finally {
    dispose()
  }
  const eventText = JSON.stringify(handle.agent.session.events)
  const decision = await ctx.digitalEmployeeAgent.promoteMemory(handle.agent, {
    employeeId: instance.id,
    content: 'Pilot acceptance criteria need Chen before the next review.',
    tags: ['atlas', 'pilot'],
    sensitive: false,
    provenance: {
      sessionId,
      source: 'project-manager-decision',
      recordedAt: '2026-08-30T00:00:01.000Z',
    },
  })
  const finalEventText = JSON.stringify(handle.agent.session.events)
  acceptance('composition', {
    skills: template.capabilities.skills,
    tools: template.capabilities.tools,
    mcpServers: template.capabilities.mcpServers,
    instructions: template.instructions.revision,
    visibleSkills,
    visibleTools: visibleTools.filter(name => !name.startsWith('mcp__')),
    visibleMcpToolCount: visibleTools.filter(name => name.startsWith('mcp__')).length,
  })
  acceptance('memory-projected', {
    projected: eventText.includes('digital-employee/memory-projection'),
    atlasSeed: eventText.includes('explicit rollback owner'),
  })
  acceptance('capabilities-used', {
    projectBoard: eventText.includes('project_board'),
    projectDocument: eventText.includes('project_document'),
    projectData: eventText.includes('mcp__project-data__project_snapshot'),
  })
  acceptance('memory-decision', { decision: decision.kind })
  acceptance('workflow-complete', {
    output: eventText.includes('Pilot is at risk'),
    durableAttribution: finalEventText.includes('digital-employee/memory-decision'),
  })
  await handle.dispose()
  await ctx.digitalEmployeeManagement.deactivate({ employeeId: instance.id })
} finally {
  await ctx?.fiber.dispose()
}
