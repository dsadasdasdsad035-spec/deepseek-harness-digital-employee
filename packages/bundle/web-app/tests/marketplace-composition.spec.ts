/**
 * Shipped marketplace composition: one Host Typert namespace over the shared
 * API carrier and one browser settings-slot contribution.
 */

import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import * as yaml from 'js-yaml'
import { describe, expect, it } from 'vitest'
import { entryListSchema } from '@deepseek-ai/cordis-plugin-include'

interface BundleRow {
  id?: string
  name?: string
  inject?: readonly string[]
  config?: Record<string, unknown>
}

describe('dsh-web-app marketplace composition', () => {
  it('mounts the Host Remote and client slot through the shared API assembly', () => {
    const root = fileURLToPath(new URL('..', import.meta.url))
    const manifest = JSON.parse(readFileSync(resolve(root, 'package.json'), 'utf8')) as {
      dependencies?: Record<string, string>
      dsh?: { bundle?: { patch?: string } }
    }
    const patchPath = manifest.dsh?.bundle?.patch
    expect(patchPath).toBe('./cordis.patch.yml')
    const parsed = yaml.load(readFileSync(resolve(root, patchPath!), 'utf8'), {
      schema: entryListSchema,
    })
    if (!Array.isArray(parsed)) throw new TypeError('web-app patch must parse to a patch list')
    const rows = parsed.flatMap((patch): BundleRow[] =>
      typeof patch === 'object' && patch !== null
        ? (patch as { insert?: BundleRow[] }).insert ?? []
        : [],
    )

    expect(rows.find(row => row.id === 'skill-market')).toEqual({
      id: 'skill-market',
      name: '@deepseek-ai/dsh-skill-market',
      config: {
        installRoot: { __jsExpr: "dshHomePath('skills')" },
      },
    })
    expect(rows.find(row => row.id === 'api-remotes')).toEqual({
      id: 'api-remotes',
      name: '@deepseek-ai/dsh-api-remotes',
    })
    expect(rows.find(row => row.id === 'ui-skill-market')).toEqual({
      id: 'ui-skill-market',
      name: '@deepseek-ai/dsh-client-ui-skill-market',
    })
    expect(rows.findIndex(row => row.id === 'api-remotes'))
      .toBeLessThan(rows.findIndex(row => row.id === 'ui-skill-market'))
    expect(manifest.dependencies).toMatchObject({
      '@deepseek-ai/dsh-api-remotes': 'workspace:^',
      '@deepseek-ai/dsh-client-ui-skill-market': 'workspace:^',
      '@deepseek-ai/dsh-skill-market': 'workspace:^',
    })
    expect(readFileSync(resolve(root, patchPath!), 'utf8')).not.toContain('/skill-market')
  })
})
