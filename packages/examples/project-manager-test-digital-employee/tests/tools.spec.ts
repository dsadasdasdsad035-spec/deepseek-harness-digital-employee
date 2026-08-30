import { Context } from '@deepseek-ai/cordis'
import { CallId } from '@deepseek-ai/dsh-llm'
import SystemPrompt from '@deepseek-ai/dsh-system-prompt'
import ToolRuntime from '@deepseek-ai/dsh-tools'
import { describe, expect, it } from 'vitest'
import { apply } from '../src/tools.ts'

describe('project-manager test tools', () => {
  it('registers deterministic project-board and project-document tools', async () => {
    const ctx = new Context()
    await ctx.plugin(SystemPrompt)
    await ctx.plugin(ToolRuntime)
    apply(ctx)

    expect(ctx.tools.schemas().map(tool => tool.name)).toEqual(['project_board', 'project_document'])
    await expect(ctx.tools.execute({
      signal: new AbortController().signal,
      callId: CallId('project-board'),
      name: 'project_board',
      arguments: {},
    })).resolves.toMatchObject({
      isError: false,
      value: { project: 'Atlas', milestones: expect.any(Array), risks: expect.any(Array) },
    })
    await expect(ctx.tools.execute({
      signal: new AbortController().signal,
      callId: CallId('project-document'),
      name: 'project_document',
      arguments: {},
    })).resolves.toMatchObject({
      isError: false,
      value: { project: 'Atlas', decision: expect.stringContaining('staged release') },
    })
  })
})
