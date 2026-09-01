/**
 * Localized settings contribution for the generated skill marketplace Remote.
 *
 * The section owns cancellable browser state; archive validation, management
 * authority, and filesystem mutation remain on the Host.
 */

import type { ClientContext } from '@deepseek-ai/dsh-client-runtime/client'
import type {} from '@deepseek-ai/dsh-client-ui-settings/client'
import type {} from '@deepseek-ai/dsh-client-locale/client'
import type {} from '@deepseek-ai/dsh-api-remotes/client'
import { SkillMarketSection } from './SkillMarketSection.tsx'
import type { SkillMarketSectionInjected } from './SkillMarketSection.tsx'
import { SkillMarketStore } from './store.ts'
import { McpMarketStore, ToolMarketStore } from './package-stores.ts'
import { en, zh, type SkillMarketKey } from './locales.ts'

export type { SkillMarketSectionInjected, SkillMarketSectionProps } from './SkillMarketSection.tsx'
export type {
  PendingSkillUpgrade, SkillMarketRemote, SkillMarketState,
} from './store.ts'
export {
  arrayBufferToBase64, bannerDataUrl, filterSkills, keyForFailure,
  MAX_UPLOAD_BYTES, SkillMarketStore, validateUploadFile,
} from './store.ts'
export {
  filterMcpPackages, filterToolPackages, McpMarketStore, ToolMarketStore,
} from './package-stores.ts'
export type { McpMarketState, ToolMarketState } from './package-stores.ts'
export type { SkillMarketKey } from './locales.ts'
export { TEMPLATE_ARCHIVE_FILENAME, TEMPLATE_ARCHIVE_URL } from './SkillMarketSection.tsx'

declare module '@deepseek-ai/dsh-client-ui-slots' {
  interface LocaleNamespaceMap {
    /** Skill marketplace settings copy. */
    'settings.skill-market': SkillMarketKey
  }
}

/** Locale namespace for skill marketplace settings text. */
export const NS = 'settings.skill-market'
export const inject = [
  'slots', 'locale', 'remote',
  'remote.skillMarket', 'remote.toolMarket', 'remote.mcpMarket',
]

/**
 * Register localized navigation and settings content for one plugin lifetime.
 * Disposal prevents stale async publication and releases retained archive and
 * image data through the section controller.
 * @param ctx - client runtime context with slots, locale, and marketplace Remote.
 */
export function apply(ctx: ClientContext): void {
  ctx.effect(() => ctx.locale.register(NS, { zh, en }), 'ui-skill-market: dictionaries')
  const controller = new SkillMarketStore(ctx.remote.skillMarket)
  const toolController = new ToolMarketStore(ctx.remote.toolMarket)
  const mcpController = new McpMarketStore(ctx.remote.mcpMarket)
  ctx.effect(() => () => { controller.dispose() }, 'ui-skill-market: release controller data')
  const t = ctx.locale.bind(NS) as SkillMarketSectionInjected['t']
  const injected = (): SkillMarketSectionInjected => ({
    controller,
    toolController,
    mcpController,
    hooks: {
      snapshot: controller.store,
      toolSnapshot: toolController.store,
      mcpSnapshot: mcpController.store,
    },
    t,
  })
  ctx.slots.inject('settings.section', () => ctx.slots.register({
    name: 'settings.section',
    id: 'skill-market',
    order: 30,
    label: () => t('nav'),
    locale: NS,
    inject: injected,
  }, SkillMarketSection))
}
