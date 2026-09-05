#!/usr/bin/env node

/**
 * Assembled hooks-market driver: installs one signed invocable echo hook
 * package through the real gateway, starts a digital employee whose template
 * binds the package, and drives the chat turn whose model round calls the
 * registered `hook__echo` tool — proving the install -> bind -> chat-trigger
 * chain on the assembled composition.
 */

import { generateKeyPairSync } from 'node:crypto'
import { fileURLToPath } from 'node:url'
import type { Context } from '@deepseek-ai/cordis'
import { boot, resolveConfigPath } from '@deepseek-ai/dsh-app-boot'
import {
  createDigitalEmployeeSubmissionId,
  createDigitalEmployeeTemplateId,
  type DigitalEmployeeAuthority,
} from '@deepseek-ai/dsh-digital-employee'
import { signMarketplacePackage } from '@deepseek-ai/dsh-marketplace-core'
import { SessionId, type SessionEvent } from '@deepseek-ai/dsh-session'
import type { ContentBlock } from '@deepseek-ai/dsh-llm'
import type {} from '@deepseek-ai/dsh-host-digital-employee-management'
import { WorkspaceId } from '@deepseek-ai/dsh-workspace'

const configPath = process.argv[2]
if (configPath === undefined) throw new Error('digital employee hooks driver requires a config path')

const fixtureDir = fileURLToPath(new URL('.', import.meta.url))

function acceptance(stage: string, data: Readonly<Record<string, unknown>>): void {
  process.stdout.write(`${JSON.stringify({ type: 'acceptance', stage, ...data })}\n`)
}

/**
 * Self-contained echo hook shipped inside the signed package: reads the event
 * JSON payload from stdin and writes a deterministic summary to stdout.
 */
const ECHO_HOOK_SOURCE = `let input = ''
process.stdin.setEncoding('utf8')
process.stdin.on('data', (chunk) => { input += chunk })
process.stdin.on('end', () => {
  process.stdout.write('HOOK-SAW:' + input.length)
})
`

const cwd = process.cwd()
process.env.DSH_HOOKS_FIXTURE_INSTALL_ROOT = `${cwd}/hooks-install-root`
process.env.DSH_HOOKS_FIXTURE_CREDENTIALS = `${cwd}/.credentials.yaml`
process.env.DSH_DIGITAL_EMPLOYEE_PRESET_ROOT = `${fixtureDir}../digital-employee-agent/presets`

const { privateKey } = generateKeyPairSync('ed25519')
const built = await signMarketplacePackage({
  kind: 'hook',
  descriptor: {
    format: 1,
    kind: 'hook',
    id: 'echo-hooks',
    version: '1.0.0',
    display: { name: 'Echo hooks', description: 'Local invocable echo hook package.' },
    publisher: { id: 'fixture-publisher', signature: 'pending' },
    files: { 'hooks/echo.js': 'GENERATED_SHA256' },
    hooks: [{
      id: 'echo',
      event: 'UserPromptSubmit',
      matcher: 'test-hook',
      command: 'node',
      args: ['hooks/echo.js'],
      invocable: true,
    }],
  },
  files: { 'hooks/echo.js': new TextEncoder().encode(ECHO_HOOK_SOURCE) },
  publisherId: 'fixture-publisher',
  privateKeyPem: privateKey.export({ type: 'pkcs8', format: 'pem' }).toString(),
})
process.env.DSH_HOOKS_FIXTURE_TRUSTED_PUBLISHERS = JSON.stringify([built.trustRecord])

let ctx: Context | undefined
try {
  ctx = await boot('digital-employee-hooks-snapshot', resolveConfigPath(configPath, undefined))
  const gateway = ctx.hookMarket

  const unconfirmed = await gateway.install({
    filename: 'echo-hooks.zip',
    archiveBase64: built.archive.toString('base64'),
  })
  if (unconfirmed.ok || unconfirmed.error.code !== 'local-execution-confirmation-required') {
    throw new Error('unconfirmed hook install must bounce with a confirmation requirement')
  }
  acceptance('install-unconfirmed', { code: unconfirmed.error.code })

  const installed = await gateway.install({
    filename: 'echo-hooks.zip',
    archiveBase64: built.archive.toString('base64'),
    confirmLocalExecution: true,
    replaceExisting: true,
  })
  if (!installed.ok) throw new Error(`confirmed hook install failed: ${JSON.stringify(installed.error)}`)
  acceptance('install-confirmed', {
    packageId: installed.value.packageId,
    operation: installed.value.operation,
    restartRequired: installed.value.restartRequired,
  })

  const listed = await gateway.list()
  if (!listed.ok) throw new Error('hook list failed')
  const entry = listed.value.entries.find(candidate => candidate.packageId === installed.value.packageId)
  if (entry === undefined) throw new Error('installed hook package missing from list')
  acceptance('listed', {
    hooks: entry.hooks.map(hook => ({
      id: hook.id,
      event: hook.event,
      matcher: hook.matcher,
      invocable: hook.invocable,
    })),
    permissions: [...entry.permissions],
  })

  const instance = await ctx.digitalEmployees.create({
    templateId: createDigitalEmployeeTemplateId('research-assistant'),
    templateVersion: '1.0.0',
    displayName: 'Ada',
    grants: {
      skills: [],
      tools: ['hook__echo'],
      mcpServers: [],
      experts: [],
      allowSubagents: false,
    } satisfies DigitalEmployeeAuthority,
  })
  await ctx.digitalEmployees.transition(instance.id, 'active')
  acceptance('employee-created', { displayName: instance.displayName, state: instance.state })

  const rootSessionId = SessionId('digital-employee-hooks-root')
  let toolResultText = ''
  const turnSettled = Promise.withResolvers<undefined>()
  const disposeListener = ctx.on('session/event', (session, event: SessionEvent) => {
    if (session.id !== rootSessionId) return
    if (event.type === 'tool/result') {
      const [block] = event.data.message.content
      toolResultText = block.content
        .map(inner => inner.type === 'text' ? inner.text : '')
        .join('')
    }
    if (event.type === 'turn/end') turnSettled.resolve(undefined)
  })
  const started = await ctx.digitalEmployeeManagement.startChat({
    employeeId: instance.id,
    workspaceId: WorkspaceId('digital-employee-management-workspace'),
    sessionId: rootSessionId,
    submissionId: createDigitalEmployeeSubmissionId('digital-employee-hooks-submission'),
    content: [{ type: 'text', text: 'Trigger the echo hook.' }],
  }, new AbortController().signal)
  try {
    await turnSettled.promise
  } finally {
    disposeListener()
  }
  acceptance('chat-started', { sessionId: started.sessionId })

  acceptance('hook-invoked-through-chat', {
    toolResultText,
    echoSawPayload: toolResultText.startsWith('HOOK-SAW:'),
  })

  const agent = ctx.agents.get(rootSessionId)
  if (agent === undefined) throw new Error('accepted digital employee Session has no live Agent')
  const toolCalls = agent.session.events
    .flatMap((event: SessionEvent) => event.type === 'assistant/message' ? event.data.message.content : [])
    .flatMap((block: ContentBlock) => block.type === 'tool-call' ? [block.name] : [])
  acceptance('session-tool-calls', {
    names: toolCalls,
    invokedEcho: toolCalls.includes('hook__echo'),
  })
} finally {
  await ctx?.fiber.dispose()
}
