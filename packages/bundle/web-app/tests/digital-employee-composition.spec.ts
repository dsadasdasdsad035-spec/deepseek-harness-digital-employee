/** Shipped digital employee Host and browser composition. */
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import * as yaml from 'js-yaml'
import { describe, expect, it } from 'vitest'
import { entryListSchema } from '@deepseek-ai/cordis-plugin-include'

interface BundleRow {
  id?: string
  name?: string
  config?: Record<string, unknown>
}

describe('dsh-web-app digital employee composition', () => {
  it('mounts the Definition, Provider, Agent consumer, gateway, and workspace in dependency order', () => {
    const root = fileURLToPath(new URL('..', import.meta.url))
    const manifest = JSON.parse(readFileSync(resolve(root, 'package.json'), 'utf8')) as {
      dependencies?: Record<string, string>
      dsh?: { bundle?: { patch?: string } }
    }
    const patchPath = manifest.dsh?.bundle?.patch
    const parsed = yaml.load(readFileSync(resolve(root, patchPath!), 'utf8'), { schema: entryListSchema })
    if (!Array.isArray(parsed)) throw new TypeError('web-app patch must parse to a patch list')
    const rows = parsed.flatMap((patch): BundleRow[] =>
      typeof patch === 'object' && patch !== null
        ? (patch as { insert?: BundleRow[] }).insert ?? []
        : [])
    const ids = rows.map(row => row.id)

    expect(rows.find(row => row.id === 'digital-employee-file')).toEqual({
      id: 'digital-employee-file',
      name: '@deepseek-ai/dsh-digital-employee-file',
      config: { path: { __jsExpr: "dshHomePath('digital-employees/employees.json')" } },
    })
    expect(rows.find(row => row.id === 'digital-employee-management')).toEqual({
      id: 'digital-employee-management',
      name: '@deepseek-ai/dsh-host-digital-employee-management',
      config: { administrator: true },
    })
    expect(ids.indexOf('digital-employees')).toBeLessThan(ids.indexOf('digital-employee-file'))
    expect(ids.indexOf('digital-employees')).toBeLessThan(ids.indexOf('digital-employee-example-template'))
    expect(ids.indexOf('digital-employees')).toBeLessThan(ids.indexOf('project-manager-test-template'))
    expect(ids.indexOf('mcp-client')).toBeLessThan(ids.indexOf('digital-employee-agent'))
    expect(ids.indexOf('digital-employee-example-template')).toBeLessThan(ids.indexOf('digital-employee-file'))
    expect(ids.indexOf('project-manager-test-template')).toBeLessThan(ids.indexOf('digital-employee-file'))
    expect(ids.indexOf('project-manager-test-skills')).toBeLessThan(ids.indexOf('digital-employee-agent'))
    expect(ids.indexOf('project-manager-test-tools')).toBeLessThan(ids.indexOf('digital-employee-agent'))
    expect(ids.indexOf('digital-employee-file')).toBeLessThan(ids.indexOf('digital-employee-agent'))
    expect(ids.indexOf('digital-employee-agent')).toBeLessThan(ids.indexOf('digital-employee-management'))
    expect(ids.indexOf('api-remotes')).toBeLessThan(ids.indexOf('ui-digital-employees'))
    expect(ids.indexOf('ui-input-trigger')).toBeLessThan(ids.indexOf('ui-digital-employees'))
    for (const id of [
      'digital-employee-management',
      'api-remotes',
      'ui-input-trigger',
      'ui-digital-employees',
    ]) {
      expect(ids.filter(candidate => candidate === id), id).toHaveLength(1)
    }
    expect(manifest.dependencies).toMatchObject({
      '@deepseek-ai/dsh-digital-employee': 'workspace:^',
      '@deepseek-ai/dsh-digital-employee-agent': 'workspace:^',
      '@deepseek-ai/dsh-digital-employee-file': 'workspace:^',
      '@deepseek-ai/dsh-digital-employee-example-template': 'workspace:^',
      '@deepseek-ai/dsh-mcp-client': 'workspace:^',
      '@deepseek-ai/dsh-project-manager-test-digital-employee': 'workspace:^',
      '@deepseek-ai/dsh-host-digital-employee-management': 'workspace:^',
      '@deepseek-ai/dsh-client-ui-digital-employees': 'workspace:^',
    })
  })
})
