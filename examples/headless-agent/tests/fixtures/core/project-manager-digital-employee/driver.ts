#!/usr/bin/env node

import type { Context } from '@deepseek-ai/cordis'
import { boot, resolveConfigPath } from '@deepseek-ai/dsh-app-boot'
import {
  createDigitalEmployeeTemplateId,
} from '@deepseek-ai/dsh-digital-employee'
import { createUserMessage } from '@deepseek-ai/dsh-llm'
import { scopeOf } from '@deepseek-ai/dsh-scope'
import { SessionId, type SessionEvent } from '@deepseek-ai/dsh-session'

const configPath = process.argv[2]
if (configPath === undefined) throw new Error('project-manager driver requires a config path')

function acceptance(stage: string, data: Readonly<Record<string, unknown>>): void {
  process.stdout.write(`${JSON.stringify({ type: 'acceptance', stage, ...data })}\n`)
}

let ctx: Context | undefined
try {
  ctx = await boot('project-manager-digital-employee-e2e', resolveConfigPath(configPath, undefined))
  const templateId = createDigitalEmployeeTemplateId('project-manager-test')
  const template = ctx.digitalEmployees.getTemplate(templateId, '1.0.0')
  if (template === undefined) throw new Error('project-manager template was not registered')
  const instance = await ctx.digitalEmployees.create({
    templateId,
    templateVersion: '1.0.0',
    displayName: 'Atlas PM',
    grants: template.capabilities,
  })
  await ctx.digitalEmployees.promoteMemory({
    employeeId: instance.id,
    content: 'Atlas delivery uses a staged release with an explicit rollback owner.',
    tags: ['atlas', 'delivery'],
    sensitive: false,
    provenance: {
      sessionId: SessionId('project-manager-memory-seed'),
      source: 'project-manager-test-seed',
      recordedAt: '2026-08-30T00:00:00.000Z',
    },
  })
  await ctx.digitalEmployees.transition(instance.id, 'active')
  const sessionId = SessionId('project-manager-root')
  const turnSettled = Promise.withResolvers<undefined>()
  const events: SessionEvent[] = []
  const dispose = ctx.on('session/event', (session, event: SessionEvent) => {
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
  // The loader path must honor the same restriction as the catalog: a skill
  // that EXISTS globally but is absent from this employee's authority must be
  // neither listable nor loadable in the employee scope.
  const foreignSkill = 'foreign-skill'
  ctx.skills.register({ name: foreignSkill, description: 'Foreign', source: 'fixture', content: 'Foreign body.' })
  const foreignVisible = (await ctx.skills.list()).map(skill => skill.name).includes(foreignSkill)
  // Re-list the employee scope after registering: the foreign skill must stay
  // absent from the restricted view even though it now exists globally.
  const foreignListed = (await skills.list({ scope })).map(skill => skill.name).includes(foreignSkill)
  const foreignLoaded = await skills.get(foreignSkill, { scope })
  acceptance('skill-isolation', {
    foreignSkill,
    foreignVisibleGlobally: foreignVisible,
    foreignListed,
    foreignLoadable: foreignLoaded !== undefined,
  })
  try {
    await turnSettled.promise
  } finally {
    dispose()
  }
  // The model-visible session skill catalog: the entries actually injected as
  // a `skill-catalog` context message, not the registry restriction view.
  const catalogSkills = handle.agent.session.events
    .flatMap(event => event.type === 'user/message' && event.data.source.kind === 'skill-catalog'
      ? event.data.source.entries.map(entry => entry.name)
      : [])
    .sort()
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
  // The composition-mounted memory tool must be reachable in the employee
  // scope and its save must flow through the same promotion policy.
  const memoryTool = tools.get('employee_memory', scope)
  if (memoryTool === undefined) throw new Error('employee memory tool was not mounted')
  const memoryToolResult = await memoryTool.execute({
    action: 'save',
    content: 'Atlas rollout pauses if the rollback owner is unreachable.',
    tags: ['atlas', 'rollback'],
  }, { agent: handle.agent, signal: new AbortController().signal } as never) as { kind: string; memoryId?: string }
  acceptance('memory-tool', {
    kind: memoryToolResult.kind,
    memoryIdAssigned: memoryToolResult.memoryId !== undefined,
    decisionLogged: finalEventText.includes('digital-employee/memory-decision'),
  })
  acceptance('composition', {
    skills: template.capabilities.skills,
    tools: template.capabilities.tools,
    mcpServers: template.capabilities.mcpServers,
    experts: template.capabilities.experts,
    instructions: template.instructions.revision,
    visibleSkills,
    visibleTools: visibleTools.filter(name => !name.startsWith('mcp__')),
    visibleMcpToolCount: visibleTools.filter(name => name.startsWith('mcp__')).length,
  })
  acceptance('skill-catalog', {
    catalogSkills,
    equalsAuthority: JSON.stringify(catalogSkills) === JSON.stringify([...template.capabilities.skills].sort()),
  })
  acceptance('memory-projected', {
    projected: eventText.includes('digital-employee/memory-projection'),
    atlasSeed: eventText.includes('explicit rollback owner'),
  })
  acceptance('capabilities-used', {
    riskReviewExpert: eventText.includes('risk-reviewer'),
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
  await ctx.digitalEmployees.transition(instance.id, 'inactive')
} finally {
  await ctx?.fiber.dispose()
}
