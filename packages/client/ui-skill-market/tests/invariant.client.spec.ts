/** 包级 invariant companion 与空 node 半。 */

import { describe, expect, it } from 'vitest'
import { Context } from '@deepseek-ai/cordis'
import InvariantRegistry from '@deepseek-ai/dsh-invariants'
import * as SkillMarketInvariant from '../src/invariant.ts'

describe('invariant companion', () => {
  it('声明自身并占用包所有权', async () => {
    const ctx = new Context()
    await ctx.plugin(InvariantRegistry, { enabled: true })

    await expect(ctx.plugin(SkillMarketInvariant).await()).resolves.toBeDefined()
  })

  it('node 半是空实现（与所有 ui-* 客户端包一致）', async () => {
    const { apply } = await import('../src/index.ts')
    // 仅作为入口占位，无副作用。
    apply()
    expect(typeof apply).toBe('function')
  })
})
