/** The package's node half: an empty host body and an explained empty invariant companion. */

import { describe, expect, it } from 'vitest'
import { Context } from '@qq296629801/cordis'
import InvariantRegistry from '@qq296629801/dsh-invariants'
import * as AgentPresetInvariant from '@qq296629801/dsh-client-ui-agent-preset/invariant'

describe('invariant companion', () => {
  it('reserves package ownership with an empty installer', async () => {
    const ctx = new Context()
    await ctx.plugin(InvariantRegistry, { enabled: true })

    await expect(ctx.plugin(AgentPresetInvariant).await()).resolves.toBeDefined()
  })

  it('has an empty node half', async () => {
    const { apply } = await import('@qq296629801/dsh-client-ui-agent-preset')

    // The host body exists only so the plugin appears in the host cordis.yml;
    // every surface this package ships lives in the browser half.
    apply()

    expect(typeof apply).toBe('function')
  })
})
