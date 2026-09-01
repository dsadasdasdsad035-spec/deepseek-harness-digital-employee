import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { basename, join } from 'node:path'
import { unzipSync, zipSync } from 'fflate'
import { afterEach, describe, expect, it } from 'vitest'
import {
  MCP_EXAMPLE_ARCHIVE_FILENAME,
  MCP_EXAMPLE_ARCHIVE_PATH,
  MARKETPLACE_TEST_PUBLISHER,
  SKILL_EXAMPLE_ARCHIVE_FILENAME,
  SKILL_EXAMPLE_ARCHIVE_PATH,
  TEMPLATE_ARCHIVE_FILENAME,
  TEMPLATE_ARCHIVE_PATH,
  TEMPLATE_SOURCE_DIRECTORY,
  TOOL_EXAMPLE_ARCHIVE_FILENAME,
  TOOL_EXAMPLE_ARCHIVE_PATH,
  generateMarketplaceExampleArchives,
  generateTemplateArchive,
  inspectMarketplaceExampleArchive,
  inspectTemplateArchive,
} from '../templates/archive.ts'

const temporaryPaths: string[] = []

afterEach(async () => {
  await Promise.all(temporaryPaths.splice(0).map(path => rm(path, { force: true, recursive: true })))
})

async function temporaryDirectory(): Promise<string> {
  const path = await mkdtemp(join(tmpdir(), 'dsh-skill-market-template-'))
  temporaryPaths.push(path)
  return path
}

describe('skill-market template package', () => {
  it('ships an archive generated deterministically from the author-readable source', async () => {
    const generatedDirectory = await temporaryDirectory()
    const generatedPath = join(generatedDirectory, TEMPLATE_ARCHIVE_FILENAME)

    await generateTemplateArchive({ outputPath: generatedPath })

    await expect(readFile(generatedPath)).resolves.toEqual(await readFile(TEMPLATE_ARCHIVE_PATH))
    expect(basename(TEMPLATE_ARCHIVE_PATH)).toBe(TEMPLATE_ARCHIVE_FILENAME)
    expect(TEMPLATE_SOURCE_DIRECTORY).toContain('template-skill')
  })

  it('contains only the documented safe authoring files and valid SKILL.md metadata', async () => {
    const archive = await readFile(TEMPLATE_ARCHIVE_PATH)
    const inspection = inspectTemplateArchive(archive)

    expect([...Object.keys(unzipSync(archive))].sort()).toEqual([
      'README.md',
      'SKILL.md',
      'references/authoring-notes.md',
    ])
    expect(inspection.name).toBe('skill-market-template')
    expect(inspection.description).toContain('marketplace')
    expect(inspection.referencePaths).toEqual(['references/authoring-notes.md'])
  })

  it('rejects packaging drift, unsafe entries, missing metadata, and unexpected files', async () => {
    const sourceDirectory = await temporaryDirectory()
    await writeFile(join(sourceDirectory, 'SKILL.md'), [
      '---',
      'description: A complete marketplace example.',
      '---',
      '',
      'Author instructions.',
      '',
    ].join('\n'))
    await writeFile(join(sourceDirectory, 'README.md'), 'Package notes.\n')
    await mkdir(join(sourceDirectory, 'references'))
    await writeFile(join(sourceDirectory, 'references', 'authoring-notes.md'), 'Reference.\n')

    await expect(generateTemplateArchive({
      outputPath: join(sourceDirectory, 'template.zip'),
      sourceDirectory,
    })).rejects.toThrow('missing required SKILL.md metadata')

    expect(() => inspectTemplateArchive(zipSync({
      '../outside.md': new TextEncoder().encode('unsafe'),
      'README.md': new TextEncoder().encode('Package notes.\n'),
      'SKILL.md': new TextEncoder().encode([
        '---',
        'name: skill-market-template',
        'description: A complete marketplace example.',
        '---',
        '',
      ].join('\n')),
      'references/authoring-notes.md': new TextEncoder().encode('Reference.\n'),
    }))).toThrow('unsafe template entry')

    expect(() => inspectTemplateArchive(zipSync({
      'README.md': new TextEncoder().encode('Package notes.\n'),
      'SKILL.md': new TextEncoder().encode([
        '---',
        'name: skill-market-template',
        'description: A complete marketplace example.',
        '---',
        '',
      ].join('\n')),
      'references/authoring-notes.md': new TextEncoder().encode('Reference.\n'),
      'surprise.md': new TextEncoder().encode('Unexpected.\n'),
    }))).toThrow('unexpected template entry')
  })

  it('ships deterministic installable Skill, Tool, and MCP examples with stable identities', async () => {
    const generatedDirectory = await temporaryDirectory()
    await generateMarketplaceExampleArchives({ outputDirectory: generatedDirectory })

    const examples = [
      [SKILL_EXAMPLE_ARCHIVE_FILENAME, SKILL_EXAMPLE_ARCHIVE_PATH, 'marketplace-test-skill'],
      [TOOL_EXAMPLE_ARCHIVE_FILENAME, TOOL_EXAMPLE_ARCHIVE_PATH, 'marketplace-test-tool'],
      [MCP_EXAMPLE_ARCHIVE_FILENAME, MCP_EXAMPLE_ARCHIVE_PATH, 'marketplace-test-mcp'],
    ] as const
    for (const [filename, checkedInPath, identity] of examples) {
      const generated = await readFile(join(generatedDirectory, filename))
      await expect(readFile(checkedInPath)).resolves.toEqual(generated)
      expect(inspectMarketplaceExampleArchive(generated)).toMatchObject({ identity })
    }
  })

  it('keeps executable trust explicit and MCP configuration reference-only', async () => {
    const tool = inspectMarketplaceExampleArchive(await readFile(TOOL_EXAMPLE_ARCHIVE_PATH))
    expect(tool).toMatchObject({
      identity: 'marketplace-test-tool',
      publisherId: MARKETPLACE_TEST_PUBLISHER.id,
      toolNames: ['marketplace_test_echo'],
    })
    expect(MARKETPLACE_TEST_PUBLISHER.publicKeyPem).toContain('BEGIN PUBLIC KEY')

    const mcpArchive = await readFile(MCP_EXAMPLE_ARCHIVE_PATH)
    const mcp = inspectMarketplaceExampleArchive(mcpArchive)
    expect(mcp).toMatchObject({
      identity: 'marketplace-test-mcp',
      publisherId: MARKETPLACE_TEST_PUBLISHER.id,
      serverNames: ['marketplace-test-mcp'],
      credentialSlots: ['MARKETPLACE_TEST_MCP_TOKEN'],
    })
    expect(mcpArchive.toString('utf8')).not.toContain('marketplace-test-token')
  })
})
