/**
 * 技能市场设置页注册测试：
 *   - 注册 services 声明
 *   - 注册 settings.section，id='skill-market'
 *   - nav 标签随 locale 切换（zh/en）
 *   - 卸载时清空注册条目与字典
 */

import { Context } from '@deepseek-ai/cordis'
import { describe, expect, it } from 'vitest'
import { resolveSlotLabel } from '@deepseek-ai/dsh-client-ui-slots'
import { SlotRegistry } from '@deepseek-ai/dsh-client-runtime/client'
import { LocaleRuntime } from '@deepseek-ai/dsh-client-locale/client'
import { apply, inject } from '../src/client/index.ts'
import { SkillMarketSection } from '../src/client/SkillMarketSection.tsx'

async function bench() {
  const ctx = new Context()
  await ctx.plugin(SlotRegistry).await()
  const locale = new LocaleRuntime(ctx)
  locale.setLocale('zh')
  ctx.provide('locale', locale)
  const skillMarket = {
    async list() {
      return { ok: true, value: { ok: true, value: { entries: [] } } }
    },
  }
  const toolMarket = { async list() { return { ok: true, value: { ok: true, value: { entries: [] } } } } }
  const mcpMarket = { async list() { return { ok: true, value: { ok: true, value: { entries: [] } } } } }
  const hookMarket = { async list() { return { ok: true, value: { ok: true, value: { entries: [] } } } } }
  ctx.provide('remote', { skillMarket, toolMarket, mcpMarket, hookMarket } as never)
  ctx.provide('remote.skillMarket', skillMarket as never)
  ctx.provide('remote.toolMarket', toolMarket as never)
  ctx.provide('remote.mcpMarket', mcpMarket as never)
  ctx.provide('remote.hookMarket', hookMarket as never)
  return { ctx, slots: ctx.get('slots') as SlotRegistry, locale }
}

function declare(slots: SlotRegistry): () => void {
  return slots.register({
    name: 'root',
    children: {
      'settings.section': { kind: 'list', scope: 'root' },
    },
  } as never, () => null)
}

describe('ui-skill-market apply', () => {
  it('declares the services it uses', () => {
    expect(inject).toEqual([
      'slots', 'locale', 'remote',
      'remote.skillMarket', 'remote.toolMarket', 'remote.mcpMarket', 'remote.hookMarket',
    ])
  })

  it('registers the section with id=skill-market and label follows locale', async () => {
    const b = await bench()
    declare(b.slots)
    await b.ctx.plugin({ inject: [...inject], apply }).await()

    const entry = b.slots.entries('settings.section')[0]!
    expect(entry.component).toBe(SkillMarketSection)
    expect(entry.options).toMatchObject({ id: 'skill-market', order: 30 })
    // nav thunk 应在 zh 环境下渲染中文标签
    expect(resolveSlotLabel(entry.options.label)).toBe('市场')
    const injected = entry.inject as unknown as () => import('../src/client/SkillMarketSection.tsx').SkillMarketSectionInjected
    expect(injected().t('nav')).toBe('市场')

    b.locale.setLocale('en')
    expect(resolveSlotLabel(b.slots.entries('settings.section')[0]!.options.label)).toBe('Marketplace')
    expect(injected().t('nav')).toBe('Marketplace')
  })

  it('registers into a declaration that arrives after apply', async () => {
    const b = await bench()
    await b.ctx.plugin({ inject: [...inject], apply }).await()
    expect(b.slots.entries('settings.section')).toHaveLength(0)
    declare(b.slots)
    await new Promise((resolve) => { setTimeout(resolve, 0) })
    expect(b.slots.entries('settings.section')).toHaveLength(1)
  })

  it('disposes section entry and dictionary with the fiber', async () => {
    const b = await bench()
    declare(b.slots)
    const fiber = b.ctx.plugin({ inject: [...inject], apply })
    await fiber.await()
    expect(b.slots.entries('settings.section')).toHaveLength(1)
    expect(b.locale.bind('settings.skill-market')('title')).toBe('市场')
    await fiber.dispose()
    expect(b.slots.entries('settings.section')).toHaveLength(0)
    // 字典已注销，重新注册同名命名空间不应抛错
    expect(() => b.locale.register('settings.skill-market', 'zh', {})).not.toThrow()
  })

  it('exposes the controller and snapshot on the injected face', async () => {
    const b = await bench()
    declare(b.slots)
    await b.ctx.plugin({ inject: [...inject], apply }).await()
    const entry = b.slots.entries('settings.section')[0]!
    const injected = (
      entry.inject as unknown as () => import('../src/client/SkillMarketSection.tsx').SkillMarketSectionInjected
    )()
    expect(injected.controller).toBeDefined()
    expect(injected.hooks.snapshot).toBe(injected.controller.store)
    expect(injected.hooks.toolSnapshot).toBe(injected.toolController.store)
    expect(injected.hooks.mcpSnapshot).toBe(injected.mcpController.store)
    expect(typeof injected.controller.load).toBe('function')
    expect(typeof injected.controller.setQuery).toBe('function')
    expect(typeof injected.controller.upload).toBe('function')
    expect(typeof injected.controller.confirmUpgrade).toBe('function')
    expect(typeof injected.controller.confirmUninstall).toBe('function')
    expect(typeof injected.controller.loadBanner).toBe('function')
  })
})
