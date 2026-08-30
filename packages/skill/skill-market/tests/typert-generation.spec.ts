import { readFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { WorkspaceTypertGenerator } from '@deepseek-ai/dsh-typert-generator'
import { describe, expect, it } from 'vitest'

const workspaceRoot = resolve(import.meta.dirname, '../../../..')

describe('skill marketplace Typert artifacts', () => {
  it('keeps the generated Host and Remote artifacts in sync', async () => {
    const [artifact] = new WorkspaceTypertGenerator(workspaceRoot)
      .generate(['@deepseek-ai/dsh-skill-market'], ['host'])

    expect(artifact).toBeDefined()
    expect(artifact!.face).toBe('host')
    expect(artifact!.remote).toBeDefined()
    expect(artifact!.remote!.dts).toContain(
      "interface TypertRemoteNamespaceMap {\n    'skillMarket': TypertRemoteNamespace$736b696c6c4d61726b6574\n  }",
    )
    expect(artifact!.remote!.dts).toContain(
      [
        '    banner: (request: SkillMarketBannerRequest) => Promise<RemoteResult<SkillMarketBannerResult>>',
        '    install: (request: SkillMarketInstallRequest) => Promise<RemoteResult<SkillMarketInstallResult>>',
        '    list: () => Promise<RemoteResult<SkillMarketListResult>>',
        '    uninstall: (request: SkillMarketUninstallRequest) => Promise<RemoteResult<SkillMarketUninstallResult>>',
      ].join('\n'),
    )

    const packageRoot = resolve(workspaceRoot, artifact!.packageRoot)
    await expect(readFile(resolve(packageRoot, 'lib/typert.host.js'), 'utf8'))
      .resolves.toBe(artifact!.js)
    await expect(readFile(resolve(packageRoot, 'lib/typert.host.d.ts'), 'utf8'))
      .resolves.toBe(artifact!.dts)
    await expect(readFile(resolve(packageRoot, 'lib/typert.remote-client.js'), 'utf8'))
      .resolves.toBe(artifact!.remote!.js)
    await expect(readFile(resolve(packageRoot, 'lib/typert.remote-client.d.ts'), 'utf8'))
      .resolves.toBe(artifact!.remote!.dts)
  })
})
