import { readFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { WorkspaceTypertGenerator } from '@deepseek-ai/dsh-typert-generator'
import { describe, expect, it } from 'vitest'

const workspaceRoot = resolve(import.meta.dirname, '../../../..')

describe('company management Typert artifacts', () => {
  it('keeps the generated Host and Remote artifacts in sync', async () => {
    const [artifact] = new WorkspaceTypertGenerator(workspaceRoot)
      .generate(['@deepseek-ai/dsh-host-company-management'], ['host'])

    expect(artifact).toBeDefined()
    expect(artifact!.remote!.dts).toContain("'companies'")
    expect(artifact!.remote!.dts).toContain('companyFloor:')
    expect(artifact!.remote!.dts).toContain('readCompanyWorldState:')
    expect(artifact!.remote!.dts).toContain('reportCompanyWorldState:')
    expect(artifact!.remote!.dts).toContain('assignEmployee:')
    expect(artifact!.remote!.dts).toContain('setPromoImage:')
    expect(artifact!.remote!.dts).toContain('availableEmployees:')
    expect(artifact!.remote!.dts).not.toContain('removeEmployee:')

    const packageRoot = resolve(workspaceRoot, artifact!.packageRoot)
    await expect(readFile(resolve(packageRoot, 'lib/typert.host.js'), 'utf8'))
      .resolves.toBe(artifact!.js)
    await expect(readFile(resolve(packageRoot, 'lib/typert.host.d.ts'), 'utf8'))
      .resolves.toBe(artifact!.dts)
    await expect(readFile(resolve(packageRoot, 'lib/typert.remote-client.js'), 'utf8'))
      .resolves.toBe(artifact!.remote!.js)
    await expect(readFile(resolve(packageRoot, 'lib/typert.remote-client.d.ts'), 'utf8'))
      .resolves.toBe(artifact!.remote!.dts)
  }, 15_000)
})
