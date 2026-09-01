#!/usr/bin/env node

import type { Context } from '@deepseek-ai/cordis'
import { boot, resolveConfigPath } from '@deepseek-ai/dsh-app-boot'
import { createDigitalEmployeeTemplateId } from '@deepseek-ai/dsh-digital-employee'
import { createUserMessage } from '@deepseek-ai/dsh-llm'
import { scopeOf } from '@deepseek-ai/dsh-scope'
import { SessionId, type SessionEvent } from '@deepseek-ai/dsh-session'

const configPath = process.argv[2]
if (configPath === undefined) throw new Error('marketplace digital employee driver requires a config path')

function acceptance(stage: string, data: Readonly<Record<string, unknown>>): void {
  process.stdout.write(`${JSON.stringify({ type: 'acceptance', stage, ...data })}\n`)
}

let ctx: Context | undefined
try {
  ctx = await boot('marketplace-digital-employee-e2e', resolveConfigPath(configPath, undefined))
  const templateId = createDigitalEmployeeTemplateId('marketplace-reference')
  const template = ctx.digitalEmployees.getTemplate(templateId, '1.0.0')
  if (template === undefined) throw new Error('marketplace reference template was not registered')
  const instance = await ctx.digitalEmployees.create({
    templateId,
    templateVersion: '1.0.0',
    displayName: 'Marketplace Reference',
    grants: template.capabilities,
  })
  await ctx.digitalEmployees.transition(instance.id, 'active')

  const sessionId = SessionId('marketplace-employee-root')
  const turnSettled = Promise.withResolvers<undefined>()
  const observed: SessionEvent[] = []
  const disposeListener = ctx.on('session/event', (session, event: SessionEvent) => {
    if (session.id !== sessionId) return
    observed.push(event)
    if (event.type === 'turn/end') turnSettled.resolve(undefined)
  })
  const handle = await ctx.digitalEmployeeAgent.createTask({
    employeeId: instance.id,
    sessionId,
    initialMessage: createUserMessage({
      content: [{ type: 'text', text: 'Exercise the selected marketplace capabilities.' }],
      source: { kind: 'user' },
    }),
  })
  const skills = handle.agent.ctx.get('skills')
  const tools = handle.agent.ctx.get('tools')
  if (skills === undefined || tools === undefined) throw new Error('marketplace employee has no scoped capabilities')
  const scope = scopeOf(handle.agent.ctx)
  const visibleSkills = (await skills.list({ scope })).map(skill => skill.name).sort()
  const visibleTools = tools.schemas(scope).map(tool => tool.name).sort()
  try {
    await turnSettled.promise
  } finally {
    disposeListener()
  }

  const eventText = JSON.stringify(observed)
  const toolResults = observed.flatMap(event => event.type === 'tool/result'
    ? [{
      callId: event.data.message.source.callId,
      error: event.data.error?.code,
      text: event.data.message.content.flatMap(result =>
        result.content.flatMap(block => block.type === 'text' ? [block.text] : [])).join(''),
    }]
    : [])
  const toolResultText = toolResults.map(result => result.text).join('\n')
  await ctx.digitalEmployees.appendAudit({
    employeeId: instance.id,
    sessionId,
    agentId: sessionId,
    category: 'capability',
    action: 'fixture.audit-barrier',
    outcome: 'succeeded',
    metadata: {},
  })
  const audits = await ctx.digitalEmployees.listAudit(instance.id)
  const auditText = JSON.stringify(audits)
  const finalText = observed.flatMap(event => event.type === 'assistant/message'
    ? event.data.message.content.flatMap(block => block.type === 'text' ? [block.text] : [])
    : []).at(-1) ?? ''
  acceptance('composition', {
    visibleSkills,
    visibleTools: visibleTools.map(name => name.startsWith('mcp__') && name.endsWith('__lookup')
      ? 'mcp__marketplace-test-mcp__lookup'
      : name),
    undeclaredAbsent: !visibleSkills.includes('marketplace-undeclared-skill')
      && !visibleTools.includes('marketplace_test_undeclared'),
    subagentsDenied: !template.capabilities.allowSubagents,
  })
  acceptance('capabilities-used', {
    skillLoaded: toolResultText.includes('MARKETPLACE_TEST_SKILL_LOADED'),
    toolResult: toolResultText.includes('MARKETPLACE_TEST_TOOL_ECHO:hello'),
    mcpResult: toolResultText.includes('MARKETPLACE_TEST_MCP_LOOKUP:risk-42'),
    toolResults,
    finalText,
  })
  acceptance('durable-attribution', {
    sessionId,
    skillAudit: auditText.includes('"action":"skill.selected"')
      && auditText.includes('"skill":"marketplace-test-skill"'),
    toolAudit: auditText.includes('"action":"tool.call"')
      && auditText.includes('"tool":"marketplace_test_echo"'),
    mcpAudit: auditText.includes('"action":"mcp.call"')
      && auditText.includes('"mcpServer":"marketplace-test-mcp"'),
    employeeAttributed: audits.every(audit => audit.employeeId === instance.id),
    agentAttributed: audits
      .filter(audit => audit.action !== 'capabilities.configured')
      .every(audit => audit.sessionId === sessionId && audit.agentId === sessionId),
    credentialAbsent: !eventText.includes('MARKETPLACE_TEST_MCP_TOKEN')
      && !auditText.includes('MARKETPLACE_TEST_MCP_TOKEN'),
    auditActions: audits.map(audit => audit.action),
  })
  await handle.dispose()
  await ctx.digitalEmployees.transition(instance.id, 'inactive')
} finally {
  await ctx?.fiber.dispose()
}
