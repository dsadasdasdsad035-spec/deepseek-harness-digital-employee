import { Context } from '@deepseek-ai/cordis'
import { CallId } from '@deepseek-ai/dsh-llm'
import { apply as applyMcp } from '@deepseek-ai/dsh-mcp-client/src/index.ts'
import SystemPrompt from '@deepseek-ai/dsh-system-prompt'
import ToolRuntime from '@deepseek-ai/dsh-tools'
import { describe, expect, it } from 'vitest'
import { PROJECT_MANAGER_TEMPLATE } from '../src/index.ts'

describe('project-manager test MCP server', () => {
  it('serves deterministic project data through the declared stdio client', async () => {
    const server = PROJECT_MANAGER_TEMPLATE.mcpServers?.[0]
    if (server?.transport !== 'stdio') throw new Error('expected the project-data stdio server')
    const ctx = new Context()
    await ctx.plugin(SystemPrompt)
    await ctx.plugin(ToolRuntime)
    await applyMcp(ctx, {
      serverName: server.id,
      command: server.command,
      args: [...server.args],
      env: { ...server.env },
      cwd: server.cwd,
      toolCallTimeoutMs: 15_000,
      failOnStartupError: true,
      transport: 'stdio',
    })

    await expect(ctx.tools.execute({
      signal: new AbortController().signal,
      callId: CallId('project-data'),
      name: 'mcp__project-data__project_snapshot',
      arguments: {},
    })).resolves.toMatchObject({
      isError: false,
      value: {
        structuredContent: {
          project: 'Atlas',
          milestones: expect.any(Array),
          risks: expect.any(Array),
        },
      },
    })
    await ctx.fiber.dispose()
  }, 30_000)
})
