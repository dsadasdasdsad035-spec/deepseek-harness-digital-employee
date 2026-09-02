import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import * as yaml from 'js-yaml'
import { entryListSchema } from '@deepseek-ai/cordis-plugin-include'

describe('digital employee suite composition', () => {
  it('adds digital employee rows without owning shared marketplace remotes', () => {
    const root = fileURLToPath(new URL('..', import.meta.url))
    const manifest = JSON.parse(readFileSync(resolve(root, 'package.json'), 'utf8')) as {
      dependencies?: Record<string, string>
      dsh?: { bundle?: { patch?: string } }
    }
    expect(manifest.dsh?.bundle?.patch).toBe('./cordis.patch.yml')
    const parsed = yaml.load(readFileSync(resolve(root, manifest.dsh!.bundle!.patch!), 'utf8'), {
      schema: entryListSchema,
    })
    if (!Array.isArray(parsed)) throw new TypeError('suite patch must parse to a patch list')
    const rows = parsed.flatMap(patch =>
      typeof patch === 'object' && patch !== null
        ? (patch as { insert?: Array<{ id?: string; name?: string; config?: Record<string, unknown> }> }).insert ?? []
        : [],
    )
    expect(rows.map(row => row.id)).toEqual([
      'digital-employees',
      'digital-employee-example-template',
      'digital-employee-file',
      'digital-employee-agent',
      'digital-employee-management',
      'ui-digital-employees',
    ])
    expect(rows.find(row => row.id === 'digital-employee-file')?.config).toEqual({
      path: { __jsExpr: "dshHomePath('digital-employees/employees.json')" },
    })
    expect(rows.find(row => row.id === 'digital-employee-management')?.config).toEqual({
      administrator: true,
      studioFile: { __jsExpr: "dshHomePath('digital-employees/configuration-studio.json')" },
    })
    expect(rows.some(row => row.id === 'api-remotes')).toBe(false)
    expect(rows.some(row => row.id === 'skill-market')).toBe(false)
    expect(manifest.dependencies).toMatchObject({
      '@deepseek-ai/dsh-client-ui-digital-employees': 'workspace:^',
      '@deepseek-ai/dsh-host-digital-employee-management': 'workspace:^',
    })
  })

  it('composes with Web-owned target-local marketplace stores', () => {
    const suiteRoot = fileURLToPath(new URL('..', import.meta.url))
    const webRoot = resolve(suiteRoot, '../web-app')
    const webManifest = JSON.parse(readFileSync(resolve(webRoot, 'package.json'), 'utf8')) as {
      dsh?: { bundle?: { patch?: string } }
    }
    const parsed = yaml.load(readFileSync(resolve(webRoot, webManifest.dsh!.bundle!.patch!), 'utf8'), {
      schema: entryListSchema,
    })
    if (!Array.isArray(parsed)) throw new TypeError('web-app patch must parse to a patch list')
    const rows = parsed.flatMap(patch =>
      typeof patch === 'object' && patch !== null
        ? (patch as { insert?: Array<{ id?: string; config?: Record<string, unknown> }> }).insert ?? []
        : [],
    )
    expect(rows.find(row => row.id === 'skill-market')?.config).toMatchObject({
      installRoot: { __jsExpr: "dshHomePath('skills')" },
    })
    expect(rows.find(row => row.id === 'tool-market')?.config).toMatchObject({
      installRoot: { __jsExpr: "dshHomePath('tools')" },
    })
    expect(rows.find(row => row.id === 'mcp-market')?.config).toMatchObject({
      installRoot: { __jsExpr: "dshHomePath('mcp-packages')" },
    })
    const ownedIds = ['skill-market', 'tool-market', 'mcp-market', 'digital-employee-management']
    expect(new Set(ownedIds).size).toBe(ownedIds.length)
    expect(rows.filter(row => ownedIds.includes(row.id ?? '')).map(row => row.id))
      .toEqual(['skill-market', 'tool-market', 'mcp-market', 'digital-employee-management'])
  })

  it('keeps durable data target-local and free of source-machine paths', () => {
    const root = fileURLToPath(new URL('..', import.meta.url))
    const patch = readFileSync(resolve(root, 'cordis.patch.yml'), 'utf8')
    expect(patch).toContain("dshHomePath('digital-employees/employees.json')")
    expect(patch).not.toContain('/Users/')
    expect(patch).not.toContain('credential')
    expect(patch).not.toContain('DEEPSEEK_API_KEY')
  })
})
