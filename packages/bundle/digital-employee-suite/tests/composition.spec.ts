/**
 * Suite bundle composition: this package owns the marketplace, digital
 * employee, and company domain rows; dsh-web-app keeps the shared
 * api-remotes carrier and the generic browser surface.
 */
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import * as yaml from 'js-yaml'
import { entryListSchema } from '@deepseek-ai/cordis-plugin-include'

interface BundleRow {
  id?: string
  name?: string
  config?: Record<string, unknown>
}

interface BundleManifest {
  dependencies?: Record<string, string>
  dsh?: { bundle?: { patch?: string } }
}

function loadBundleRows(root: string): { rows: BundleRow[]; manifest: BundleManifest; patch: string } {
  const manifest = JSON.parse(readFileSync(resolve(root, 'package.json'), 'utf8')) as BundleManifest
  expect(manifest.dsh?.bundle?.patch).toBe('./cordis.patch.yml')
  const patch = readFileSync(resolve(root, manifest.dsh!.bundle!.patch!), 'utf8')
  const parsed = yaml.load(patch, { schema: entryListSchema })
  if (!Array.isArray(parsed)) throw new TypeError('bundle patch must parse to a patch list')
  const rows = parsed.flatMap(entry =>
    typeof entry === 'object' && entry !== null ? (entry as { insert?: BundleRow[] }).insert ?? [] : [])
  return { rows, manifest, patch }
}

/** Every domain row id the suite owns, in the order its patch inserts them. */
const DOMAIN_ROWS = [
  'skill-market',
  'tool-market',
  'mcp-client',
  'mcp-market',
  'hooks-market',
  'workflow-market',
  'subagent-market',
  'digital-employees',
  'digital-employee-example-template',
  'project-manager-test-template',
  'digital-employee-sqlite',
  'digital-employee-agent',
  'digital-employee-management',
  'company',
  'company-file',
  'company-management',
  'company-group-chat',
  'ui-skill-market',
  'ui-digital-employees',
  'ui-companies',
] as const

/** The workspace packages that moved from dsh-web-app to this bundle. */
const DOMAIN_PACKAGES = [
  '@deepseek-ai/dsh-client-ui-companies',
  '@deepseek-ai/dsh-client-ui-digital-employees',
  '@deepseek-ai/dsh-client-ui-skill-market',
  '@deepseek-ai/dsh-company',
  '@deepseek-ai/dsh-company-file',
  '@deepseek-ai/dsh-digital-employee',
  '@deepseek-ai/dsh-digital-employee-agent',
  '@deepseek-ai/dsh-digital-employee-example-template',
  '@deepseek-ai/dsh-digital-employee-sqlite',
  '@deepseek-ai/dsh-host-company-group-chat',
  '@deepseek-ai/dsh-host-company-management',
  '@deepseek-ai/dsh-host-digital-employee-management',
  '@deepseek-ai/dsh-hooks-market',
  '@deepseek-ai/dsh-mcp-client',
  '@deepseek-ai/dsh-mcp-market',
  '@deepseek-ai/dsh-project-manager-test-digital-employee',
  '@deepseek-ai/dsh-skill-market',
  '@deepseek-ai/dsh-subagent-market',
  '@deepseek-ai/dsh-tool-market',
  '@deepseek-ai/dsh-workflow-market',
] as const

const suiteRoot = fileURLToPath(new URL('..', import.meta.url))
const webRoot = resolve(suiteRoot, '../web-app')

describe('digital employee suite composition', () => {
  it('owns every marketplace, digital employee, and company row in dependency order', () => {
    const { rows, manifest } = loadBundleRows(suiteRoot)
    expect(rows.map(row => row.id)).toEqual([...DOMAIN_ROWS])
    const ids = rows.map(row => row.id)

    // Marketplace stores live under the target Harness home; publisher trust
    // is deployment config, not a baked list.
    expect(rows.find(row => row.id === 'skill-market')?.config).toEqual({
      installRoot: { __jsExpr: "dshHomePath('skills')" },
    })
    expect(rows.find(row => row.id === 'tool-market')?.config).toMatchObject({
      installRoot: { __jsExpr: "dshHomePath('tools')" },
      trustedPublishersFile: { __jsExpr: "dshHomePath('market-publishers.json')" },
    })
    expect(rows.find(row => row.id === 'mcp-client')?.config).toEqual({ mode: 'manager' })

    // The management gateway keeps the studio default the Web row never had.
    expect(rows.find(row => row.id === 'digital-employee-management')?.config).toEqual({
      administrator: true,
      studioFile: { __jsExpr: "dshHomePath('digital-employees/configuration-studio.json')" },
    })
    expect(rows.find(row => row.id === 'company-file')?.config).toEqual({
      path: { __jsExpr: "dshHomePath('companies/companies.json')" },
    })

    // Dependency order: the MCP manager precedes the composition consumer,
    // the Definition precedes its providers and consumers, the company file
    // store precedes its gateway, and browser rows come last.
    expect(ids.indexOf('mcp-client')).toBeLessThan(ids.indexOf('digital-employee-agent'))
    expect(ids.indexOf('digital-employees')).toBeLessThan(ids.indexOf('digital-employee-sqlite'))
    expect(ids.indexOf('digital-employee-sqlite')).toBeLessThan(ids.indexOf('digital-employee-agent'))
    expect(ids.indexOf('digital-employee-agent')).toBeLessThan(ids.indexOf('digital-employee-management'))
    expect(ids.indexOf('company-file')).toBeLessThan(ids.indexOf('company-management'))
    expect(ids.indexOf('company-group-chat')).toBeLessThan(ids.indexOf('ui-skill-market'))
    for (const id of DOMAIN_ROWS) {
      expect(ids.filter(candidate => candidate === id), id).toHaveLength(1)
    }

    // Every domain package is a declared dependency, so the bundle installs
    // as one unit.
    expect(manifest.dependencies).toMatchObject(
      Object.fromEntries(DOMAIN_PACKAGES.map(name => [name, 'workspace:^'])),
    )
  })

  it('leaves the shared carrier and generic surface to the Web bundle', () => {
    const web = loadBundleRows(webRoot)
    expect(web.rows.find(row => row.id === 'api-remotes')?.name).toBe('@deepseek-ai/dsh-api-remotes')
    expect(web.rows.find(row => row.id === 'ui-input-trigger')?.name).toBe('@deepseek-ai/dsh-client-ui-input-trigger')
    const webIds = new Set(web.rows.map(row => row.id))
    for (const id of DOMAIN_ROWS) {
      expect(webIds.has(id), `web-app must not own ${id}`).toBe(false)
    }
    for (const name of DOMAIN_PACKAGES) {
      expect(web.manifest.dependencies?.[name], `web-app must not depend on ${name}`).toBeUndefined()
    }
  })

  it('keeps durable data target-local and free of source-machine paths', () => {
    const { patch } = loadBundleRows(suiteRoot)
    expect(patch).toContain("dshHomePath('skills')")
    expect(patch).toContain("dshHomePath('companies/companies.json')")
    expect(patch).not.toContain('/Users/')
    expect(patch).not.toContain('DEEPSEEK_API_KEY')
  })
})
