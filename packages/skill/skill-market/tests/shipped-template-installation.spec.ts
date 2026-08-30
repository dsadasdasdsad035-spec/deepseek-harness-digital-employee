import { afterEach, describe, expect, it } from 'vitest'
import { mkdtemp, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createSkillMarketService } from '../src/market-service.ts'

const TEMPLATE_ARCHIVE_PATH = new URL(
  '../../../../apps/web/public/skill-market-template.zip',
  import.meta.url,
)
let installRoot: string | undefined

afterEach(async () => {
  if (installRoot !== undefined) {
    await rm(installRoot, { force: true, recursive: true })
    installRoot = undefined
  }
})

function silentLogger() {
  return { error: () => {}, info: () => {}, warn: () => {} }
}

describe('shipped skill-market template archive', () => {
  it('installs the checked-in ZIP into an isolated user skill directory and lists it', async () => {
    installRoot = await mkdtemp(join(tmpdir(), 'dsh-shipped-skill-template-'))
    const archive = await readFile(TEMPLATE_ARCHIVE_PATH)
    const service = createSkillMarketService({
      logger: silentLogger() as never,
      resolveInstallRoot: () => installRoot!,
    })

    const installed = await service.install({
      filename: 'skill-market-template.zip',
      data: archive.toString('base64'),
    })

    expect(installed).toMatchObject({
      name: 'skill-market-template',
      replaced: false,
    })
    await expect(readFile(join(installRoot, 'skill-market-template', 'SKILL.md'), 'utf8'))
      .resolves.toContain('name: skill-market-template')
    await expect(readFile(join(installRoot, 'skill-market-template', 'references', 'authoring-notes.md'), 'utf8'))
      .resolves.toContain('Reference files are optional.')
    await expect(service.list()).resolves.toEqual({
      entries: [expect.objectContaining({
        description: 'A complete marketplace skill template for authoring a safe, installable ZIP package.',
        hasBanner: false,
        name: 'skill-market-template',
      })],
    })
  })
})
