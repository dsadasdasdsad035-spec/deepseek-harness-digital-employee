import { describe, expect, it } from 'vitest'
import { inspectZipArchive } from '../src/archive.ts'
import { validateArchive } from '../src/market-service.ts'
import { buildZip } from './fixtures/zip.ts'

const encoder = new TextEncoder()

async function validate(frontmatter: string): Promise<unknown> {
  const zip = await buildZip([{
    name: 'SKILL.md',
    data: encoder.encode(`---\n${frontmatter}\n---\n\nInstructions.\n`),
  }, {
    name: 'assets/banner.png',
    data: Uint8Array.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
  }])
  const inspected = await inspectZipArchive(zip)
  return await validateArchive({
    entries: inspected.entries.map(entry => ({
      rawName: entry.name,
      bytes: entry.bytes,
      declaredOriginalSize: entry.declaredBytes,
      kind: entry.kind,
    })),
    totalBytes: inspected.totalBytes,
  })
}

async function rejects(frontmatter: string): Promise<void> {
  await expect(validate(frontmatter)).rejects.toMatchObject({
    code: 'frontmatter-invalid',
  })
}

describe('skill marketplace descriptor validation', () => {
  it('accepts bounded marketplace metadata', async () => {
    await expect(validate([
      'name: descriptor-test',
      'description: Descriptor test',
      'metadata:',
      '  marketplace:',
      '    version: 1.2.3',
      '    author: DeepSeek',
      '    tags: [tools, local]',
      '    banner: assets/banner.png',
    ].join('\n'))).resolves.toMatchObject({
      name: 'descriptor-test',
      description: 'Descriptor test',
      marketplace: {
        version: '1.2.3',
        author: 'DeepSeek',
        tags: ['tools', 'local'],
        banner: 'assets/banner.png',
      },
    })
  })

  it.each([
    ['non-object metadata', 'metadata: invalid'],
    ['non-object marketplace metadata', 'metadata:\n  marketplace: invalid'],
    ['missing frontmatter', 'name: descriptor-test'],
    ['missing name', 'description: Descriptor test'],
    ['empty description', 'name: descriptor-test\ndescription: ""'],
    ['invalid name', 'name: Descriptor_Test\ndescription: Descriptor test'],
    ['invalid invocation metadata', 'name: descriptor-test\ndescription: Descriptor test\nuser-invocable: maybe'],
  ])('rejects %s', async (_label, frontmatter) => {
    await rejects(frontmatter)
  })

  it.each([
    ['unknown key', '    unknown: value'],
    ['empty version', '    version: ""'],
    ['long version', `    version: ${'v'.repeat(65)}`],
    ['empty author', '    author: ""'],
    ['long author', `    author: ${'a'.repeat(129)}`],
    ['non-array tags', '    tags: tools'],
    ['too many tags', `    tags: [${Array.from({ length: 17 }, (_, index) => `tag-${index}`).join(', ')}]`],
    ['empty tag', '    tags: [""]'],
    ['long tag', `    tags: [${'t'.repeat(33)}]`],
    ['duplicate tag', '    tags: [tools, tools]'],
    ['empty banner', '    banner: ""'],
    ['long banner', `    banner: ${'b'.repeat(257)}`],
  ])('rejects marketplace metadata with %s', async (_label, field) => {
    await rejects([
      'name: descriptor-test',
      'description: Descriptor test',
      'metadata:',
      '  marketplace:',
      field,
    ].join('\n'))
  })
})
