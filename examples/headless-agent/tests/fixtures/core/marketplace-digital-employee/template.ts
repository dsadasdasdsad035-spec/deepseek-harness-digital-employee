import type { Context } from '@deepseek-ai/cordis'
import { createRequire } from 'node:module'
import { resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import {
  createDigitalEmployeeTemplateId,
  type DigitalEmployeeTemplate,
} from '@deepseek-ai/dsh-digital-employee'

const fixtureRequire = createRequire(resolve(
  import.meta.dirname,
  '../../../../../../packages/examples/project-manager-test-digital-employee/package.json',
))

const template: DigitalEmployeeTemplate = {
  id: createDigitalEmployeeTemplateId('marketplace-reference'),
  version: '1.0.0',
  display: {
    name: 'Marketplace Reference',
    description: 'Keyless employee using the installable marketplace examples.',
  },
  personality: 'Precise and explicit about capability results.',
  instructions: {
    kind: 'file',
    root: import.meta.dirname,
    path: 'AGENTS.md',
    revision: 'marketplace-reference-v1',
  },
  preset: 'marketplace-employee',
  mcpServers: [{
    id: 'marketplace-test-mcp',
    transport: 'stdio',
    command: process.execPath,
    args: [resolve(import.meta.dirname, 'marketplace-test-mcp.mjs')],
    env: {
      DSH_MCP_SERVER_MODULE: pathToFileURL(fixtureRequire.resolve('@modelcontextprotocol/sdk/server/mcp.js')).href,
      DSH_MCP_STDIO_MODULE: pathToFileURL(fixtureRequire.resolve('@modelcontextprotocol/sdk/server/stdio.js')).href,
      DSH_MCP_ZOD_MODULE: pathToFileURL(fixtureRequire.resolve('zod')).href,
    },
    envCredentials: {},
    cwd: import.meta.dirname,
    failOnStartupError: true,
  }],
  capabilities: {
    skills: ['marketplace-test-skill'],
    tools: ['marketplace_test_echo'],
    mcpServers: ['marketplace-test-mcp'],
    experts: [],
    allowSubagents: false,
  },
  experts: [],
  delegation: {
    maxDepth: 0,
    maxConcurrency: 1,
    timeoutMs: 30_000,
  },
}

export const name = 'marketplace-digital-employee-template'
export const inject = ['digitalEmployees']

/** Register the immutable marketplace reference template. */
export function apply(ctx: Context): void {
  ctx.digitalEmployees.registerTemplate(template)
}
