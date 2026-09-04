import { Context } from '@deepseek-ai/cordis'
import { CallId } from '@deepseek-ai/dsh-llm'
import SystemPrompt from '@deepseek-ai/dsh-system-prompt'
import { ToolRuntime } from '@deepseek-ai/dsh-tools'
import { describe, expect, it } from 'vitest'

/**
 * Real-registry regression: the distributed template plugin must satisfy the
 * current Tool registration contract, not a permissive test mock.
 */

describe('Tool publisher template plugin', () => {
  it('registers and executes against the real Tool registry', async () => {
    const ctx = new Context()
    await ctx.plugin(SystemPrompt, {})
    await ctx.plugin(ToolRuntime, { mode: 'native' })
    // @ts-expect-error -- the distributed template artifact ships no type declarations.
    const template = await import('../../../client/ui-skill-market/templates/template-tool/plugin/index.js') as {
      readonly name: string
      readonly inject: readonly string[]
      readonly apply: (ctx: Context) => void
    }

    await ctx.plugin(template as never, {} as never)

    expect(ctx.tools.schemas().map(tool => tool.name)).toContain('marketplace_echo')
    const result = await ctx.tools.execute({
      signal: AbortSignal.timeout(5_000),
      callId: CallId('template-activation'),
      name: 'marketplace_echo',
      arguments: { text: 'hello from the template' },
    })
    expect(result).toMatchObject({
      isError: false,
      content: [{ type: 'text', text: 'hello from the template' }],
    })
    await ctx.fiber.dispose()
  })
})
