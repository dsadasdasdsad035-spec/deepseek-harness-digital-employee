/** Versioned package descriptors for trusted Tool and declarative MCP bundles. */

import { createHash, verify } from 'node:crypto'
import { posix } from 'node:path'
import { z } from 'zod'
import type { InspectedArchive, InspectedArchiveEntry } from './archive.ts'

const identifier = z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/)
const toolName = z.string().regex(/^[A-Za-z0-9_-]+$/)
const reference = z.string().regex(/^[A-Z][A-Z0-9_]*$/)
const relativePath = z.string().regex(/^(?!\/)(?!.*(?:^|\/)\.\.(?:\/|$))[A-Za-z0-9._/-]+$/)
const fileHashes = z.record(relativePath, z.string().regex(/^[a-f0-9]{64}$/)).refine(
  files => Object.keys(files).length <= 256,
  'package declares too many files',
)

const base = z.object({
  format: z.literal(1),
  id: identifier,
  version: z.string().min(1).max(128),
  display: z.object({ name: z.string().min(1).max(128), description: z.string().min(1).max(512) }).strict(),
  publisher: z.object({ id: identifier, signature: z.string().min(1).max(8192) }).strict(),
  files: fileHashes,
}).strict()

/** Parsed executable Tool package metadata; its code is activated only after Host restart. */
export const toolPackageDescriptorSchema = base.extend({
  kind: z.literal('tool'),
  permissions: z.array(z.enum(['filesystem-read', 'filesystem-write', 'network', 'subprocess'])).min(1).max(16),
  tools: z.array(z.object({
    name: toolName,
    description: z.string().min(1).max(512),
    inputDescription: z.string().min(1).max(512),
  }).strict()).min(1).max(128),
  entry: relativePath,
}).strict()

/** Parsed declarative MCP package metadata without any credential values. */
export const mcpPackageDescriptorSchema = base.extend({
  kind: z.literal('mcp'),
  servers: z.array(z.object({
    id: identifier,
    transport: z.literal('streamable-http'),
    url: z.string().url(),
    headers: z.record(z.string(), z.string()).default({}),
    credentialReferences: z.record(z.string(), reference).default({}),
  }).strict()).min(1).max(32),
}).strict()

/** Validated executable Tool package descriptor. */
export type ToolPackageDescriptor = z.infer<typeof toolPackageDescriptorSchema>
/** Validated credential-free MCP package descriptor. */
export type McpPackageDescriptor = z.infer<typeof mcpPackageDescriptorSchema>
/** Descriptor accepted by shared signature and file-table operations. */
export type MarketplacePackageDescriptor = ToolPackageDescriptor | McpPackageDescriptor

/** One locally trusted publisher key configured by the Host administrator. */
export interface TrustedPublisher {
  readonly id: string
  readonly publicKeyPem: string
}

/**
 * Parse one Tool descriptor from untrusted archive JSON.
 * @param value - Parsed JSON value.
 * @returns Validated Tool descriptor.
 */
export function parseToolPackageDescriptor(value: unknown): ToolPackageDescriptor {
  return toolPackageDescriptorSchema.parse(value)
}

/**
 * Parse one credential-free MCP descriptor.
 * @param value - Parsed JSON value.
 * @returns Validated MCP descriptor.
 */
export function parseMcpPackageDescriptor(value: unknown): McpPackageDescriptor {
  const descriptor = mcpPackageDescriptorSchema.parse(value)
  for (const server of descriptor.servers) {
    for (const [header, value] of Object.entries(server.headers)) {
      if (server.credentialReferences[header] !== undefined && value !== '') {
        throw new Error(`MCP header "${header}" must not contain a credential value`)
      }
    }
  }
  return descriptor
}

/**
 * Serialize the immutable descriptor fields covered by the detached publisher signature.
 * @param descriptor - Parsed package descriptor.
 * @returns UTF-8 canonical JSON bytes with the signature field omitted.
 */
export function descriptorSignaturePayload(descriptor: MarketplacePackageDescriptor): Uint8Array {
  const { signature: _signature, ...publisher } = descriptor.publisher
  return new TextEncoder().encode(JSON.stringify({ ...descriptor, publisher }))
}

/**
 * Normalize and validate archive paths before any filesystem publication.
 * @param archive - Bounded ZIP inventory.
 * @param descriptorFilename - Required root descriptor filename.
 * @returns Archive with normalized, unique relative paths.
 */
export function preparePackageArchive(
  archive: InspectedArchive,
  descriptorFilename: 'tool-package.json' | 'mcp-package.json',
): InspectedArchive {
  const seen = new Set<string>()
  const entries: InspectedArchiveEntry[] = archive.entries.map((entry) => {
    const normalized = posix.normalize(entry.name.replaceAll('\\', '/')).replace(/^\.\//, '')
    if (
      normalized === ''
      || normalized === '.'
      || normalized.startsWith('/')
      || normalized === '..'
      || normalized.startsWith('../')
    ) {
      throw new Error(`unsafe archive path "${entry.name}"`)
    }
    if (seen.has(normalized)) throw new Error(`duplicate archive path "${normalized}"`)
    seen.add(normalized)
    if (entry.kind === 'symbolic-link' || entry.kind === 'unsupported') {
      throw new Error(`unsupported archive entry "${normalized}"`)
    }
    return { ...entry, name: normalized }
  })
  const descriptorEntries = entries.filter(entry => entry.name === descriptorFilename && entry.kind === 'regular')
  if (descriptorEntries.length !== 1) throw new Error(`archive must contain one root ${descriptorFilename}`)
  return { entries, totalBytes: archive.totalBytes }
}

/**
 * Verify every non-descriptor regular file against the descriptor's signed SHA-256 table.
 * @param archive - Normalized package archive.
 * @param files - Signed relative-path to lowercase SHA-256 mapping.
 */
export function verifyPackageFileHashes(
  archive: InspectedArchive,
  files: Readonly<Record<string, string>>,
): void {
  const actual = archive.entries.filter(entry =>
    entry.kind === 'regular'
    && entry.name !== 'tool-package.json'
    && entry.name !== 'mcp-package.json')
  const actualNames = new Set(actual.map(entry => entry.name))
  for (const entry of actual) {
    const expected = files[entry.name]
    if (expected === undefined) throw new Error(`package file "${entry.name}" is not declared`)
    const observed = createHash('sha256').update(entry.bytes).digest('hex')
    if (observed !== expected) throw new Error(`package file "${entry.name}" hash mismatch`)
  }
  for (const filename of Object.keys(files)) {
    if (!actualNames.has(filename)) throw new Error(`declared package file "${filename}" is missing`)
  }
}

/**
 * Verify an Ed25519 publisher signature over exact descriptor bytes.
 * @param payload - Descriptor bytes read from the validated archive.
 * @param signatureBase64 - Publisher-provided detached signature.
 * @param publicKeyPem - Locally trusted publisher public key.
 * @returns whether the signature and key are valid.
 */
export function verifyPublisherSignature(
  payload: Uint8Array,
  signatureBase64: string,
  publicKeyPem: string,
): boolean {
  try {
    const signature = Buffer.from(signatureBase64, 'base64')
    if (signature.byteLength === 0 || signature.toString('base64').replace(/=+$/, '') !== signatureBase64.replace(/=+$/, '')) {
      return false
    }
    return verify(null, payload, publicKeyPem, signature)
  } catch {
    return false
  }
}

/**
 * Resolve one publisher key from the local trust configuration.
 * @param publishers - Host-owned trusted publisher records.
 * @param publisherId - Descriptor publisher identity.
 * @returns trusted public key, or undefined when no trust record exists.
 */
export function resolveTrustedPublisher(
  publishers: readonly TrustedPublisher[],
  publisherId: string,
): string | undefined {
  const matches = publishers.filter(publisher => publisher.id === publisherId)
  if (matches.length > 1) throw new Error(`trusted publisher "${publisherId}" is configured more than once`)
  return matches[0]?.publicKeyPem
}
