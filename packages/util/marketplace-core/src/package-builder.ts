/** Producer-side assembly of signed Tool and MCP marketplace packages. */

import { createHash, createPrivateKey, createPublicKey, sign } from 'node:crypto'
import { lstat, readFile, readdir } from 'node:fs/promises'
import { join, relative, sep } from 'node:path'
import type { Zippable } from 'fflate'
import { zipSync } from 'fflate'
import { inspectZipArchive } from './archive.ts'
import {
  descriptorSignaturePayload,
  parseHookPackageDescriptor,
  parseMcpPackageDescriptor,
  parseToolPackageDescriptor,
  preparePackageArchive,
  verifyPackageFileHashes,
  verifyPublisherSignature,
} from './descriptors.ts'
import type {
  MarketplacePackageDescriptor,
  TrustedPublisher,
} from './descriptors.ts'

/** Package kinds accepted by the publisher toolchain. */
export type MarketplacePackageKind = 'tool' | 'mcp' | 'hook'

/** Descriptor filename required at the root of each package kind. */
export const PACKAGE_DESCRIPTOR_FILENAMES: Readonly<
  Record<MarketplacePackageKind, 'tool-package.json' | 'mcp-package.json' | 'hook-package.json'>
> = {
  tool: 'tool-package.json',
  mcp: 'mcp-package.json',
  hook: 'hook-package.json',
}

/** Publisher identities derived from the shipped template placeholder. */
const PLACEHOLDER_PUBLISHER_ID = /^replace-with-[a-z0-9-]*$/

/** Fixed entry timestamp that makes repeated builds byte-identical. */
const FIXED_ARCHIVE_MTIME = new Date('2000-01-01T00:00:00.000Z')

/** Builder inputs; the descriptor's own publisher fields are replaced. */
export interface BuildMarketplacePackageOptions {
  /** Directory whose regular files form the package inventory. */
  readonly sourceDirectory: string
  /** Descriptor schema and filename selecting Tool or MCP assembly. */
  readonly kind: MarketplacePackageKind
  /** Real publisher identity written into the descriptor and trust record. */
  readonly publisherId: string
  /** Ed25519 private key in PKCS #8 PEM form. */
  readonly privateKeyPem: string
}

/** In-memory signing inputs for tests and programmatic package assembly. */
export interface SignMarketplacePackageOptions {
  /** Descriptor kind selecting the parser and archive filename. */
  readonly kind: MarketplacePackageKind
  /** Raw descriptor JSON value; signature and file hashes are replaced. */
  readonly descriptor: unknown
  /** Exact non-descriptor file inventory keyed by relative path. */
  readonly files: Readonly<Record<string, Uint8Array>>
  /** Real publisher identity written into the descriptor and trust record. */
  readonly publisherId: string
  /** Ed25519 private key in PKCS #8 PEM form. */
  readonly privateKeyPem: string
}

/** Signed package ready for marketplace installation. */
export interface BuiltMarketplacePackage {
  /** Deterministic installable ZIP bytes. */
  readonly archive: Buffer
  /** Signed descriptor embedded in the archive. */
  readonly descriptor: MarketplacePackageDescriptor
  /** Trusted-publisher record matching the signing key. */
  readonly trustRecord: TrustedPublisher
}

/**
 * Assemble and self-validate one signed marketplace package.
 * @param options - Source directory, kind, publisher identity, and signing key.
 * @returns Installable archive, its signed descriptor, and the matching trust record.
 */
export async function buildMarketplacePackage(
  options: BuildMarketplacePackageOptions,
): Promise<BuiltMarketplacePackage> {
  const descriptorFilename = PACKAGE_DESCRIPTOR_FILENAMES[options.kind]
  const sourcePaths = await readSourcePackageFiles(options.sourceDirectory)
  if (!sourcePaths.includes(descriptorFilename)) {
    throw new Error(`source directory must contain one root ${descriptorFilename}`)
  }
  const inventory = new Set(sourcePaths.filter(path => path !== descriptorFilename))

  const rawDescriptor = JSON.parse(
    await readFile(join(options.sourceDirectory, descriptorFilename), 'utf8'),
  ) as unknown
  const declaredFiles = declaredDescriptorFiles(rawDescriptor)
  const files: Record<string, Buffer> = {}
  if (declaredFiles !== null) {
    assertExactFileInventory(declaredFiles, [...inventory], descriptorFilename)
    for (const path of declaredFiles) {
      files[path] = await readFile(join(options.sourceDirectory, path))
    }
  }
  return signMarketplacePackage({
    kind: options.kind,
    descriptor: rawDescriptor,
    files,
    publisherId: options.publisherId,
    privateKeyPem: options.privateKeyPem,
  })
}

/**
 * Sign and self-validate one marketplace package from in-memory files.
 * @param options - Raw descriptor, exact file inventory, identity, and key.
 * @returns Installable archive, its signed descriptor, and the matching trust record.
 */
export async function signMarketplacePackage(
  options: SignMarketplacePackageOptions,
): Promise<BuiltMarketplacePackage> {
  if (PLACEHOLDER_PUBLISHER_ID.test(options.publisherId)) {
    throw new Error(`publisher identity "${options.publisherId}" is still the template placeholder`)
  }
  if (typeof options.descriptor !== 'object' || options.descriptor === null || Array.isArray(options.descriptor)) {
    const descriptorFilename = PACKAGE_DESCRIPTOR_FILENAMES[options.kind]
    throw new Error(`${descriptorFilename} must contain a JSON object`)
  }
  const rawFiles = (options.descriptor as { files?: unknown }).files
  if (typeof rawFiles !== 'object' || rawFiles === null || Array.isArray(rawFiles)) {
    const descriptorFilename = PACKAGE_DESCRIPTOR_FILENAMES[options.kind]
    throw new Error(`${descriptorFilename} must declare a "files" object`)
  }
  assertExactFileInventory(Object.keys(rawFiles), Object.keys(options.files), PACKAGE_DESCRIPTOR_FILENAMES[options.kind])

  const fileHashes: Record<string, string> = {}
  for (const [path, bytes] of Object.entries(options.files)) {
    fileHashes[path] = createHash('sha256').update(bytes).digest('hex')
  }
  const unsigned = {
    ...options.descriptor,
    publisher: { id: options.publisherId, signature: 'pending-builder-signature' },
    files: fileHashes,
  } as unknown
  const parsed = options.kind === 'tool'
    ? parseToolPackageDescriptor(unsigned)
    : options.kind === 'mcp'
      ? parseMcpPackageDescriptor(unsigned)
      : parseHookPackageDescriptor(unsigned)

  const privateKey = createPrivateKey(options.privateKeyPem)
  if (privateKey.asymmetricKeyType !== 'ed25519') {
    throw new Error('publisher key must be an Ed25519 private key')
  }
  const signature = signEd25519(descriptorSignaturePayload(parsed), privateKey)
  const descriptor: MarketplacePackageDescriptor = {
    ...parsed,
    publisher: { id: parsed.publisher.id, signature },
  }

  const descriptorFilename = PACKAGE_DESCRIPTOR_FILENAMES[options.kind]
  const zippable: Zippable = {
    [descriptorFilename]: [Buffer.from(JSON.stringify(descriptor)), { mtime: FIXED_ARCHIVE_MTIME }],
  }
  for (const [path, bytes] of Object.entries(options.files).toSorted((left, right) => left[0].localeCompare(right[0]))) {
    zippable[path] = [bytes, { mtime: FIXED_ARCHIVE_MTIME }]
  }
  const archive = Buffer.from(zipSync(zippable, { level: 9 }))

  const publicKeyPem = createPublicKey(privateKey).export({ type: 'spki', format: 'pem' }).toString()
  await validateBuiltArchive(archive, options.kind, publicKeyPem)
  return { archive, descriptor, trustRecord: { id: options.publisherId, publicKeyPem } }
}

/**
 * Read the descriptor's declared file names without accepting invalid values.
 * @param descriptor - Raw descriptor JSON value.
 * @returns Declared relative paths, or null when the descriptor is not an object.
 */
function declaredDescriptorFiles(descriptor: unknown): readonly string[] | null {
  if (typeof descriptor !== 'object' || descriptor === null || Array.isArray(descriptor)) return null
  const files = (descriptor as { files?: unknown }).files
  if (typeof files !== 'object' || files === null || Array.isArray(files)) return null
  return Object.keys(files)
}

/**
 * Require every declared file to be provided and nothing more.
 * @param declared - Descriptor-declared relative paths.
 * @param provided - Actually available relative paths.
 * @param descriptorFilename - Descriptor filename for failure context.
 */
function assertExactFileInventory(
  declared: readonly string[],
  provided: readonly string[],
  descriptorFilename: string,
): void {
  const providedNames = new Set(provided)
  for (const path of declared) {
    if (!providedNames.has(path)) {
      throw new Error(`declared package file "${path}" is missing from the package source`)
    }
  }
  const declaredNames = new Set(declared)
  for (const path of provided) {
    if (!declaredNames.has(path)) {
      throw new Error(`package source file "${path}" is not declared in ${descriptorFilename}`)
    }
  }
}

/**
 * Sign the canonical descriptor payload with an Ed25519 private key.
 * @param payload - Canonical descriptor bytes.
 * @param privateKey - Parsed Ed25519 private key.
 * @returns Detached signature encoded as base64.
 */
function signEd25519(payload: Uint8Array, privateKey: ReturnType<typeof createPrivateKey>): string {
  return sign(null, payload, privateKey).toString('base64')
}

/**
 * List every regular source file as a safe package-relative path.
 * @param root - Source directory to walk.
 * @param current - Current directory during recursion.
 * @returns Sorted relative POSIX paths of regular files.
 */
async function readSourcePackageFiles(root: string, current = root): Promise<readonly string[]> {
  const entries = await readdir(current, { withFileTypes: true })
  const paths: string[] = []
  for (const entry of entries.sort((left, right) => left.name.localeCompare(right.name))) {
    const fullPath = join(current, entry.name)
    const path = relative(root, fullPath).split(sep).join('/')
    const info = await lstat(fullPath)
    if (info.isSymbolicLink()) throw new Error(`unsafe source entry "${path}"`)
    if (info.isDirectory()) {
      paths.push(...await readSourcePackageFiles(root, fullPath))
      continue
    }
    if (!info.isFile()) throw new Error(`unsupported source entry "${path}"`)
    paths.push(path)
  }
  return paths
}

/**
 * Re-run the installer-shared checks over freshly assembled bytes.
 * @param archive - ZIP bytes produced by the builder.
 * @param kind - Package kind selecting the descriptor parser.
 * @param publicKeyPem - Public key derived from the signing key.
 */
async function validateBuiltArchive(
  archive: Buffer,
  kind: MarketplacePackageKind,
  publicKeyPem: string,
): Promise<void> {
  const descriptorFilename = PACKAGE_DESCRIPTOR_FILENAMES[kind]
  const inspected = await inspectZipArchive(archive)
  const prepared = preparePackageArchive(inspected, descriptorFilename)
  const descriptorEntry = prepared.entries.find(entry => entry.name === descriptorFilename)
  /* v8 ignore next 3 -- defensive: the assembly above writes exactly one root descriptor */
  if (descriptorEntry === undefined || descriptorEntry.kind !== 'regular') {
    throw new Error(`built archive lost its root ${descriptorFilename}`)
  }
  const reparsed = JSON.parse(new TextDecoder().decode(descriptorEntry.bytes)) as unknown
  const descriptor = kind === 'tool'
    ? parseToolPackageDescriptor(reparsed)
    : kind === 'mcp'
      ? parseMcpPackageDescriptor(reparsed)
      : parseHookPackageDescriptor(reparsed)
  verifyPackageFileHashes(prepared, descriptor.files)
  /* v8 ignore next 2 -- defensive: the signature was produced from the same bytes */
  if (!verifyPublisherSignature(descriptorSignaturePayload(descriptor), descriptor.publisher.signature, publicKeyPem)) {
    throw new Error('built package failed its publisher-signature self-check')
  }
}
