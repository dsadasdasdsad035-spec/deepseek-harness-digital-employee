#!/usr/bin/env node

/**
 * Assembled MCP marketplace stdio driver: installs one signed stdio package
 * through the real gateway, configures credential references, restarts into a
 * fresh composition, and exercises the mounted child-server tool.
 */

import { generateKeyPairSync } from 'node:crypto'
import type { Context } from '@deepseek-ai/cordis'
import { boot, resolveConfigPath } from '@deepseek-ai/dsh-app-boot'
import { credentialRef } from '@deepseek-ai/dsh-credentials'
import { CallId } from '@deepseek-ai/dsh-llm'
import { signMarketplacePackage } from '@deepseek-ai/dsh-marketplace-core'

const configPath = process.argv[2]
if (configPath === undefined) throw new Error('mcp-market stdio driver requires a config path')

/**
 * Self-contained stdio MCP server shipped inside the signed package: a
 * newline-delimited JSON-RPC loop with no dependencies, replaying identically
 * on macOS, Linux, and Windows. The echo tool reports whether the fixed env
 * and the credential-backed env reached the child, never their values.
 */
const STDIO_SERVER_SOURCE = `const readline = require('node:readline')
const reply = (message) => process.stdout.write(JSON.stringify(message) + '\\n')
readline.createInterface({ input: process.stdin, terminal: false }).on('line', (line) => {
  const trimmed = line.trim()
  if (trimmed === '') return
  let message
  try { message = JSON.parse(trimmed) } catch { return }
  if (message.method === 'initialize') {
    reply({ jsonrpc: '2.0', id: message.id, result: {
      protocolVersion: message.params === undefined ? undefined : message.params.protocolVersion,
      capabilities: { tools: {} },
      serverInfo: { name: 'stdio-fixture', version: '1.0.0' },
    } })
    return
  }
  if (message.method === 'tools/list') {
    reply({ jsonrpc: '2.0', id: message.id, result: { tools: [{
      name: 'fixture_echo',
      description: 'Echo text and report whether the declared environments reached the server.',
      inputSchema: { type: 'object', properties: { text: { type: 'string' } }, required: ['text'] },
    }] } })
    return
  }
  if (message.method === 'tools/call') {
    const text = message.params === undefined || message.params.arguments === undefined
      ? ''
      : String(message.params.arguments.text)
    const token = process.env.API_TOKEN
    reply({ jsonrpc: '2.0', id: message.id, result: { content: [{
      type: 'text',
      text: text + ':' + (process.env.FIXTURE_MODE ?? 'mode-missing') + ':' + (token === undefined || token === '' ? 'token-missing' : 'token-present'),
    }] } })
    return
  }
  if (message.id !== undefined) {
    reply({ jsonrpc: '2.0', id: message.id, error: { code: -32601, message: 'method not found' } })
  }
})
`

function acceptance(stage: string, data: Readonly<Record<string, unknown>>): void {
  process.stdout.write(`${JSON.stringify({ type: 'acceptance', stage, ...data })}\n`)
}

const cwd = process.cwd()
process.env.DSH_MCP_FIXTURE_INSTALL_ROOT = `${cwd}/mcp-install-root`
process.env.DSH_MCP_FIXTURE_CREDENTIALS = `${cwd}/.credentials.yaml`

const { privateKey } = generateKeyPairSync('ed25519')
const built = await signMarketplacePackage({
  kind: 'mcp',
  descriptor: {
    format: 1,
    kind: 'mcp',
    id: 'stdio-fixture-suite',
    version: '1.0.0',
    display: { name: 'Stdio fixture suite', description: 'Local stdio MCP server package.' },
    publisher: { id: 'fixture-publisher', signature: 'pending' },
    files: { 'server/index.js': 'GENERATED_SHA256' },
    servers: [{
      id: 'stdio-fixture',
      transport: 'stdio',
      command: 'node',
      args: ['server/index.js'],
      env: { FIXTURE_MODE: 'assembled' },
      credentialReferences: { API_TOKEN: 'FIXTURE_ECHO_TOKEN' },
    }],
  },
  files: { 'server/index.js': new TextEncoder().encode(STDIO_SERVER_SOURCE) },
  publisherId: 'fixture-publisher',
  privateKeyPem: privateKey.export({ type: 'pkcs8', format: 'pem' }).toString(),
})
process.env.DSH_MCP_FIXTURE_TRUSTED_PUBLISHERS = JSON.stringify([built.trustRecord])

let ctx: Context | undefined
try {
  ctx = await boot('mcp-market-stdio-snapshot', resolveConfigPath(configPath, undefined))
  const gateway = ctx.mcpMarket

  const unconfirmed = await gateway.install({
    filename: 'stdio-fixture-suite.zip',
    archiveBase64: built.archive.toString('base64'),
  })
  if (unconfirmed.ok || unconfirmed.error.code !== 'local-execution-confirmation-required') {
    throw new Error('unconfirmed stdio install must bounce with a confirmation requirement')
  }
  acceptance('install-unconfirmed', {
    code: unconfirmed.error.code,
    candidatePermissions: [...unconfirmed.error.candidatePermissions],
  })

  const installed = await gateway.install({
    filename: 'stdio-fixture-suite.zip',
    archiveBase64: built.archive.toString('base64'),
    confirmLocalExecution: true,
  })
  if (!installed.ok) throw new Error(`confirmed stdio install failed: ${JSON.stringify(installed.error)}`)
  acceptance('install-confirmed', {
    packageId: installed.value.packageId,
    operation: installed.value.operation,
    restartRequired: installed.value.restartRequired,
  })

  await ctx.credentials.set(credentialRef('FIXTURE_ECHO_TOKEN'), 'fixture-resolved-token')
  const credentialInfo = await ctx.credentials.describe(credentialRef('FIXTURE_ECHO_TOKEN'))
  acceptance('credentials-set', { configured: credentialInfo.configured })

  const configured = await gateway.configure({
    packageId: installed.value.packageId,
    credentialReferences: { FIXTURE_ECHO_TOKEN: 'FIXTURE_ECHO_TOKEN' },
  })
  if (!configured.ok) throw new Error(`stdio configuration failed: ${JSON.stringify(configured.error)}`)
  acceptance('configured', { slots: Object.keys(configured.value.credentialReferences).sort() })

  await gateway.activateConfigured()

  const mountedTools = ctx.tools.schemas()
    .map(tool => tool.name)
    .filter(name => name.startsWith('mcp__'))
    .sort()
  acceptance('activated', { tools: mountedTools })

  const executed = await ctx.tools.execute({
    signal: new AbortController().signal,
    callId: CallId('mcp-market-stdio-snapshot-1'),
    name: 'mcp__stdio-fixture__fixture_echo',
    arguments: { text: 'assembled-round-trip' },
  })
  const firstBlock = executed.content[0]
  acceptance('tool-called', {
    isError: executed.isError === true,
    text: firstBlock !== undefined && firstBlock.type === 'text' ? firstBlock.text : '',
  })

  const listed = await gateway.list()
  if (!listed.ok) throw new Error('stdio list failed')
  const entry = listed.value.entries.find(candidate => candidate.packageId === installed.value.packageId)
  if (entry === undefined) throw new Error('installed stdio package missing from list')
  acceptance('listed', {
    servers: entry.servers.map(server => ({
      serverName: server.serverName,
      transport: server.transport,
      available: server.available,
    })),
    permissions: [...entry.permissions],
    available: entry.available,
    diagnosticCleared: entry.diagnostic === undefined,
  })

  const templates = await gateway.templateConfigurations()
  const declaration = templates[0]?.declaration
  if (declaration === undefined || declaration.transport !== 'stdio') {
    throw new Error('stdio template declaration missing')
  }
  acceptance('templated', {
    transport: declaration.transport,
    command: declaration.command,
    envCredentialSlots: Object.keys(declaration.envCredentials).sort(),
    cwdInsideManagedPackage: declaration.cwd.includes('stdio-fixture-suite'),
  })
} finally {
  await ctx?.fiber.dispose()
}
