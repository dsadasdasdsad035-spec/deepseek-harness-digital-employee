import { readFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { WorkspaceTypertGenerator } from '@deepseek-ai/dsh-typert-generator'
import { describe, expect, it } from 'vitest'

const workspaceRoot = resolve(import.meta.dirname, '../../../..')

describe('digital employee management Typert artifacts', () => {
  it('keeps the generated Host and Remote artifacts in sync', async () => {
    const [artifact] = new WorkspaceTypertGenerator(workspaceRoot)
      .generate(['@deepseek-ai/dsh-host-digital-employee-management'], ['host'])

    expect(artifact).toBeDefined()
    expect(artifact!.remote!.dts).toContain("'digitalEmployees'")
    expect(artifact!.remote!.dts).toContain('startChat:')
    expect(artifact!.remote!.dts).toContain('signal?: AbortSignal')
    expect(artifact!.remote!.dts).not.toContain('runTask:')
    expect(artifact!.remote!.dts).toContain('applyUpgrade:')
    expect(artifact!.remote!.dts).toContain('importEmployee:')
    expect(artifact!.remote!.js).toContain("'data': z.string()")
    expect(artifact!.remote!.js).not.toContain("'attachmentId':")

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
