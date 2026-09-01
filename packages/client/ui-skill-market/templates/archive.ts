import { createHash, createPrivateKey, sign } from 'node:crypto'
import { lstat, mkdir, readFile, readdir, writeFile } from 'node:fs/promises'
import { dirname, join, relative, resolve, sep } from 'node:path'
import { fileURLToPath } from 'node:url'
import { unzipSync, zipSync } from 'fflate'
import type { Zippable } from 'fflate'
import {
  descriptorSignaturePayload,
  parseMcpPackageDescriptor,
  parseToolPackageDescriptor,
  verifyPublisherSignature,
} from '@deepseek-ai/dsh-marketplace-core'

const packageDirectory = resolve(fileURLToPath(new URL('..', import.meta.url)))
const repositoryRoot = resolve(packageDirectory, '../../..')

/** Archive filename exposed by the marketplace download action. */
export const TEMPLATE_ARCHIVE_FILENAME = 'skill-market-template.zip'
/** Author-readable source directory for the downloaded ZIP. */
export const TEMPLATE_SOURCE_DIRECTORY = join(packageDirectory, 'templates', 'template-skill')
/** Checked-in Vite public asset generated from {@link TEMPLATE_SOURCE_DIRECTORY}. */
export const TEMPLATE_ARCHIVE_PATH = join(
  repositoryRoot,
  'apps',
  'web',
  'public',
  TEMPLATE_ARCHIVE_FILENAME,
)
/** Checked-in Tool and MCP publisher template assets. */
export const TOOL_TEMPLATE_ARCHIVE_PATH = join(repositoryRoot, 'apps', 'web', 'public', 'tool-market-template.zip')
export const MCP_TEMPLATE_ARCHIVE_PATH = join(repositoryRoot, 'apps', 'web', 'public', 'mcp-market-template.zip')
/** Directly installable marketplace reference archive filenames. */
export const SKILL_EXAMPLE_ARCHIVE_FILENAME = 'marketplace-test-skill.zip'
export const TOOL_EXAMPLE_ARCHIVE_FILENAME = 'marketplace-test-tool.zip'
export const MCP_EXAMPLE_ARCHIVE_FILENAME = 'marketplace-test-mcp.zip'
/** Checked-in directly installable marketplace reference assets. */
export const SKILL_EXAMPLE_ARCHIVE_PATH = join(repositoryRoot, 'apps', 'web', 'public', SKILL_EXAMPLE_ARCHIVE_FILENAME)
export const TOOL_EXAMPLE_ARCHIVE_PATH = join(repositoryRoot, 'apps', 'web', 'public', TOOL_EXAMPLE_ARCHIVE_FILENAME)
export const MCP_EXAMPLE_ARCHIVE_PATH = join(repositoryRoot, 'apps', 'web', 'public', MCP_EXAMPLE_ARCHIVE_FILENAME)

/** Test-only publisher trust record; production configuration never includes it automatically. */
export const MARKETPLACE_TEST_PUBLISHER = {
  id: 'deepseek-marketplace-test',
  publicKeyPem: '-----BEGIN PUBLIC KEY-----\nMCowBQYDK2VwAyEAVvVFYX/zscUEEadGCx5qApj2V6mmiV8iBQ/9rOHi3bE=\n-----END PUBLIC KEY-----\n',
} as const

const MARKETPLACE_TEST_PRIVATE_KEY_PEM = '-----BEGIN PRIVATE KEY-----\nMC4CAQAwBQYDK2VwBCIEIH1t/DNTU3GZ/g3PVcY7qJGAQro2HC+w50Xec7Xq9Jo0\n-----END PRIVATE KEY-----\n'

const TEMPLATE_SOURCE_PATHS = [
  'README.md',
  'README.i18n.yaml',
  'SKILL.md',
  'README.zh.md',
  'references',
  'references/authoring-notes.md',
] as const
const TEMPLATE_FILE_PATHS: readonly string[] = [
  'README.md',
  'SKILL.md',
  'references/authoring-notes.md',
]
const TEMPLATE_REQUIRED_SOURCE_PATHS: readonly string[] = [
  ...TEMPLATE_FILE_PATHS,
  'references',
]
const TEMPLATE_SKILL_NAME = 'skill-market-template'
const FIXED_MODIFICATION_TIME = new Date('2000-01-01T00:00:00.000Z')

/** Validated summary of the author-facing skill descriptor. */
export interface TemplateArchiveInspection {
  /** Stable skill identity demonstrated by the template. */
  readonly name: string
  /** Required human-readable descriptor summary. */
  readonly description: string
  /** Optional-package reference files included in the archive. */
  readonly referencePaths: readonly string[]
}

/** Parameters for deterministic archive generation. */
export interface GenerateTemplateArchiveOptions {
  /** Destination ZIP path. */
  readonly outputPath?: string
  /** Source directory to package. Tests provide isolated invalid directories. */
  readonly sourceDirectory?: string
}

/** Parameters for deterministic installable example generation. */
export interface GenerateMarketplaceExampleArchivesOptions {
  /** Directory receiving all three example archives. */
  readonly outputDirectory?: string
}

/** Safe summary of one directly installable marketplace example. */
export interface MarketplaceExampleArchiveInspection {
  /** Stable Skill, Tool package, or MCP package identity. */
  readonly identity: string
  /** Signed publisher identity for executable or declarative packages. */
  readonly publisherId?: string | undefined
  /** Tool identities declared by a Tool package. */
  readonly toolNames?: readonly string[] | undefined
  /** Server identities declared by an MCP package. */
  readonly serverNames?: readonly string[] | undefined
  /** Credential reference slots declared without resolved values. */
  readonly credentialSlots?: readonly string[] | undefined
  /** Host-owned endpoint reference names declared without resolved URLs. */
  readonly endpointReferences?: readonly string[] | undefined
}

function assertSafeTemplatePath(path: string): void {
  if (
    path === ''
    || path.includes('\0')
    || path.startsWith('/')
    || path.startsWith('\\')
    || /^[A-Za-z]:/.test(path)
    || path.split('/').some(part => part === '' || part === '.' || part === '..')
  ) {
    throw new Error(`unsafe template entry: ${JSON.stringify(path)}`)
  }
}

function assertExpectedTemplatePaths(paths: readonly string[]): void {
  for (const path of paths) {
    assertSafeTemplatePath(path)
    if (!TEMPLATE_FILE_PATHS.includes(path)) {
      throw new Error(`unexpected template entry: ${path}`)
    }
  }
  for (const path of TEMPLATE_FILE_PATHS) {
    if (!paths.includes(path)) throw new Error(`missing required template entry: ${path}`)
  }
}

function parseSkillMetadata(skillMd: Uint8Array): TemplateArchiveInspection {
  const content = new TextDecoder('utf-8', { fatal: true }).decode(skillMd)
  const match = /^---\r?\n([\s\S]*?)\r?\n---\r?\n([\s\S]+)$/u.exec(content)
  if (match === null) throw new Error('missing required SKILL.md metadata')
  const frontmatter = match[1] ?? ''
  const body = (match[2] ?? '').trim()
  const name = /^name:\s*([a-z0-9]+(?:-[a-z0-9]+)*)\s*$/mu.exec(frontmatter)?.[1]
  const description = /^description:\s*(.+?)\s*$/mu.exec(frontmatter)?.[1]
  if (name === undefined || description === undefined || body === '') {
    throw new Error('missing required SKILL.md metadata')
  }
  if (name !== TEMPLATE_SKILL_NAME) {
    throw new Error(`unexpected template skill name: ${name}`)
  }
  if (!description.toLocaleLowerCase().includes('marketplace')) {
    throw new Error('template description must identify the marketplace')
  }
  return {
    name,
    description,
    referencePaths: ['references/authoring-notes.md'],
  }
}

async function sourceEntries(root: string, current = root): Promise<readonly string[]> {
  const entries = await readdir(current, { withFileTypes: true })
  const paths: string[] = []
  for (const entry of entries.sort((left, right) => left.name.localeCompare(right.name))) {
    const fullPath = join(current, entry.name)
    const path = relative(root, fullPath).split(sep).join('/')
    const info = await lstat(fullPath)
    if (info.isSymbolicLink()) throw new Error(`unsafe template source entry: ${path}`)
    if (info.isDirectory()) {
      paths.push(path)
      paths.push(...await sourceEntries(root, fullPath))
      continue
    }
    if (!info.isFile() || (info.mode & 0o111) !== 0) {
      throw new Error(`unsafe template source entry: ${path}`)
    }
    paths.push(path)
  }
  return paths
}

async function readTemplateSource(sourceDirectory: string): Promise<Readonly<Record<string, Uint8Array>>> {
  const paths = await sourceEntries(sourceDirectory)
  for (const path of paths) {
    if (!TEMPLATE_SOURCE_PATHS.includes(path as typeof TEMPLATE_SOURCE_PATHS[number])) {
      throw new Error(`unexpected template source file: ${path}`)
    }
  }
  for (const path of TEMPLATE_REQUIRED_SOURCE_PATHS) {
    if (!paths.includes(path)) throw new Error(`missing required template source file: ${path}`)
  }

  const files: Record<string, Uint8Array> = {}
  for (const path of TEMPLATE_FILE_PATHS) files[path] = await readFile(join(sourceDirectory, path))
  parseSkillMetadata(files['SKILL.md']!)
  return files
}

/**
 * Inspect one delivered archive for the exact, safe marketplace template inventory.
 * @param archive - ZIP bytes produced for browser download.
 * @returns validated skill metadata and reference inventory.
 */
export function inspectTemplateArchive(archive: Uint8Array): TemplateArchiveInspection {
  const entries = unzipSync(archive)
  const paths = Object.keys(entries).sort()
  assertExpectedTemplatePaths(paths)
  return parseSkillMetadata(entries['SKILL.md']!)
}

/**
 * Create the checked-in marketplace template ZIP from its reviewed source files.
 * @param options - Optional isolated source and output paths for package tests.
 * @returns the generated archive bytes.
 */
export async function generateTemplateArchive(
  options: GenerateTemplateArchiveOptions = {},
): Promise<Buffer> {
  const sourceDirectory = options.sourceDirectory ?? TEMPLATE_SOURCE_DIRECTORY
  const outputPath = options.outputPath ?? TEMPLATE_ARCHIVE_PATH
  const files = await readTemplateSource(sourceDirectory)
  const archiveInput: Zippable = {}
  for (const path of TEMPLATE_FILE_PATHS) {
    archiveInput[path] = [files[path]!, { mtime: FIXED_MODIFICATION_TIME }]
  }
  const archive = Buffer.from(zipSync(archiveInput, { level: 9 }))
  inspectTemplateArchive(archive)
  await mkdir(dirname(outputPath), { recursive: true })
  await writeFile(outputPath, archive)
  return archive
}

async function generatePackageTemplate(
  sourceDirectory: string,
  descriptorName: 'tool-package.json' | 'mcp-package.json',
  outputPath: string,
): Promise<Buffer> {
  const descriptor = JSON.parse(await readFile(join(sourceDirectory, descriptorName), 'utf8')) as {
    files: Record<string, string>
  }
  const readme = await readFile(join(sourceDirectory, 'README.md'))
  const archiveInput: Zippable = {
    'README.md': [readme, { mtime: FIXED_MODIFICATION_TIME }],
  }
  if (descriptorName === 'tool-package.json') {
    const entry = await readFile(join(sourceDirectory, 'plugin/index.js'))
    descriptor.files = {
      'README.md': createHash('sha256').update(readme).digest('hex'),
      'plugin/index.js': createHash('sha256').update(entry).digest('hex'),
    }
    archiveInput['plugin/index.js'] = [entry, { mtime: FIXED_MODIFICATION_TIME }]
  } else {
    descriptor.files = {
      'README.md': createHash('sha256').update(readme).digest('hex'),
    }
  }
  archiveInput[descriptorName] = [
    Buffer.from(`${JSON.stringify(descriptor, null, 2)}\n`),
    { mtime: FIXED_MODIFICATION_TIME },
  ]
  const archive = Buffer.from(zipSync(archiveInput, { level: 9 }))
  await mkdir(dirname(outputPath), { recursive: true })
  await writeFile(outputPath, archive)
  return archive
}

function signedDescriptor<Descriptor extends ReturnType<
  typeof parseToolPackageDescriptor | typeof parseMcpPackageDescriptor
>>(descriptor: Descriptor): Descriptor {
  const signature = sign(
    null,
    descriptorSignaturePayload(descriptor),
    createPrivateKey(MARKETPLACE_TEST_PRIVATE_KEY_PEM),
  ).toString('base64')
  return {
    ...descriptor,
    publisher: { ...descriptor.publisher, signature },
  }
}

function archive(entries: Readonly<Record<string, Uint8Array>>): Buffer {
  const input: Zippable = {}
  for (const [path, bytes] of Object.entries(entries).sort(([left], [right]) => left.localeCompare(right))) {
    input[path] = [bytes, { mtime: FIXED_MODIFICATION_TIME }]
  }
  return Buffer.from(zipSync(input, { level: 9 }))
}

/** Inspect identities and reference-only metadata in a shipped installable example. */
export function inspectMarketplaceExampleArchive(bytes: Uint8Array): MarketplaceExampleArchiveInspection {
  const entries = unzipSync(bytes)
  if (entries['SKILL.md'] !== undefined) {
    const content = new TextDecoder('utf8', { fatal: true }).decode(entries['SKILL.md'])
    const identity = /^name:\s*(marketplace-test-skill)\s*$/mu.exec(content)?.[1]
    if (identity === undefined) throw new Error('invalid marketplace Skill example')
    return { identity }
  }
  if (entries['tool-package.json'] !== undefined) {
    const descriptor = parseToolPackageDescriptor(JSON.parse(
      new TextDecoder('utf8', { fatal: true }).decode(entries['tool-package.json']),
    ))
    if (!verifyPublisherSignature(
      descriptorSignaturePayload(descriptor),
      descriptor.publisher.signature,
      MARKETPLACE_TEST_PUBLISHER.publicKeyPem,
    )) throw new Error('invalid marketplace Tool example signature')
    return {
      identity: descriptor.id,
      publisherId: descriptor.publisher.id,
      toolNames: descriptor.tools.map(tool => tool.name),
    }
  }
  if (entries['mcp-package.json'] !== undefined) {
    const descriptor = parseMcpPackageDescriptor(JSON.parse(
      new TextDecoder('utf8', { fatal: true }).decode(entries['mcp-package.json']),
    ))
    if (!verifyPublisherSignature(
      descriptorSignaturePayload(descriptor),
      descriptor.publisher.signature,
      MARKETPLACE_TEST_PUBLISHER.publicKeyPem,
    )) throw new Error('invalid marketplace MCP example signature')
    return {
      identity: descriptor.id,
      publisherId: descriptor.publisher.id,
      serverNames: descriptor.servers.map(server => server.id),
      credentialSlots: [...new Set(descriptor.servers.flatMap(server =>
        Object.values(server.credentialReferences)))].sort(),
      endpointReferences: descriptor.servers.flatMap(server =>
        server.endpointReference === undefined ? [] : [server.endpointReference]),
    }
  }
  throw new Error('unknown marketplace example archive')
}

/** Generate all directly installable marketplace reference archives. */
export async function generateMarketplaceExampleArchives(
  options: GenerateMarketplaceExampleArchivesOptions = {},
): Promise<void> {
  const outputDirectory = options.outputDirectory ?? join(repositoryRoot, 'apps', 'web', 'public')
  const skillDirectory = join(packageDirectory, 'templates', 'example-skill')
  const toolDirectory = join(packageDirectory, 'templates', 'example-tool')
  const mcpDirectory = join(packageDirectory, 'templates', 'example-mcp')
  const skill = archive({
    'README.md': await readFile(join(skillDirectory, 'README.md')),
    'SKILL.md': await readFile(join(skillDirectory, 'SKILL.md')),
  })
  const toolEntry = await readFile(join(toolDirectory, 'plugin/index.js'))
  const toolReadme = await readFile(join(toolDirectory, 'README.md'))
  const tool = parseToolPackageDescriptor({
    format: 1,
    kind: 'tool',
    id: 'marketplace-test-tool',
    version: '1.0.0',
    display: {
      name: 'Marketplace test Tool',
      description: 'Deterministic echo Tool for marketplace and digital employee tests.',
    },
    publisher: { id: MARKETPLACE_TEST_PUBLISHER.id, signature: 'pending' },
    files: {
      'README.md': createHash('sha256').update(toolReadme).digest('hex'),
      'plugin/index.js': createHash('sha256').update(toolEntry).digest('hex'),
    },
    permissions: ['filesystem-read'],
    tools: [{
      name: 'marketplace_test_echo',
      description: 'Return a deterministic marketplace test marker with supplied text.',
      inputDescription: 'Object with required string field text.',
    }],
    entry: 'plugin/index.js',
  })
  const mcpReadme = await readFile(join(mcpDirectory, 'README.md'))
  const mcp = parseMcpPackageDescriptor({
    format: 1,
    kind: 'mcp',
    id: 'marketplace-test-mcp',
    version: '1.0.0',
    display: {
      name: 'Marketplace test MCP',
      description: 'Offline Streamable HTTP fixture for marketplace and digital employee tests.',
    },
    publisher: { id: MARKETPLACE_TEST_PUBLISHER.id, signature: 'pending' },
    files: { 'README.md': createHash('sha256').update(mcpReadme).digest('hex') },
    servers: [{
      id: 'marketplace-test-mcp',
      transport: 'streamable-http',
      endpointReference: 'MARKETPLACE_TEST_MCP_ENDPOINT',
      headers: { Authorization: '' },
      credentialReferences: { Authorization: 'MARKETPLACE_TEST_MCP_TOKEN' },
    }],
  })
  const outputs = [
    [SKILL_EXAMPLE_ARCHIVE_FILENAME, skill],
    [TOOL_EXAMPLE_ARCHIVE_FILENAME, archive({
      'README.md': toolReadme,
      'plugin/index.js': toolEntry,
      'tool-package.json': Buffer.from(`${JSON.stringify(signedDescriptor(tool), null, 2)}\n`),
    })],
    [MCP_EXAMPLE_ARCHIVE_FILENAME, archive({
      'README.md': mcpReadme,
      'mcp-package.json': Buffer.from(`${JSON.stringify(signedDescriptor(mcp), null, 2)}\n`),
    })],
  ] as const
  await mkdir(outputDirectory, { recursive: true })
  for (const [filename, bytes] of outputs) {
    inspectMarketplaceExampleArchive(bytes)
    await writeFile(join(outputDirectory, filename), bytes)
  }
}

/** Generate all browser-download marketplace templates. */
export async function generateMarketplaceTemplateArchives(): Promise<void> {
  await generateTemplateArchive()
  await generatePackageTemplate(
    join(packageDirectory, 'templates', 'template-tool'),
    'tool-package.json',
    TOOL_TEMPLATE_ARCHIVE_PATH,
  )
  await generatePackageTemplate(
    join(packageDirectory, 'templates', 'template-mcp'),
    'mcp-package.json',
    MCP_TEMPLATE_ARCHIVE_PATH,
  )
  await generateMarketplaceExampleArchives()
}
