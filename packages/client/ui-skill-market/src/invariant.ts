/**
 * Package-owned invariant companion for `@deepseek-ai/dsh-client-ui-skill-market`.
 * @module @deepseek-ai/dsh-client-ui-skill-market/invariant
 */

/* jscpd:ignore-start */
import type { Context } from '@deepseek-ai/cordis'
import type { InvariantInstaller } from '@deepseek-ai/dsh-invariants'

const PACKAGE_NAME = '@deepseek-ai/dsh-client-ui-skill-market'

/** Cordis companion plugin name. */
export const name = 'client-ui-skill-market-invariant'
/** Service required before the companion can reserve package ownership. */
export const inject = ['invariants']

/**
 * 没有运行时不变式：技能市场是浏览器的设置页面，目录与服务端 RPC 都
 * 由 Host 包负责，此处不声明任何额外的跨插件关系。
 */
// No runtime invariant: the Host marketplace package owns transaction and discovery relationships.
const install: InvariantInstaller = () => {}

/**
 * 注册本包的不变式伴随插件。
 * @param ctx - 携带 invariants 服务的 Cordis 上下文。
 * @returns 完成设置后返回的释放器。
 */
export const apply = (ctx: Context): Promise<() => void> =>
  Promise.resolve(ctx.invariants.register(PACKAGE_NAME, install))
/* jscpd:ignore-end */
