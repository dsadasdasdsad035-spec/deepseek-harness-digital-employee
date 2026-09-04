/** Versioned package descriptors for trusted Tool and declarative MCP bundles. */

import { createHash, verify } from 'node:crypto'
import { posix } from 'node:path'
import { z } from 'zod'
import type { InspectedArchive, InspectedArchiveEntry } from './archive.ts'

const identifier = z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/)
const toolName = z.string().regex(/^[A-Za-z0-9_-]+$/)
const reference = z.string().regex(/^[A-Z][A-Z0-9_]*$/)
const relativePath = z.string().regex(/^(?!\/)(?!.*(?:^|\/)\.\.(?:\/|$))[A-Za-z0-9._/-]+$/)

/** Permission disclosure names shared by Tool and MCP package descriptors. */
const permissionName = z.enum(['filesystem-read', 'filesystem-write', 'network', 'subprocess'])

/** Bare interpreter command name; path separators are rejected so only allowlisted runtimes can be named. */
const bareCommand = z.string().regex(/^[A-Za-z0-9._-]+$/)

/**
 * One stdio argument token. Slash-containing values are additionally required
 * to be declared package files by `parseMcpPackageDescriptor`, which pins every
 * script path to the signed file table; slash-free tokens cannot resolve above
 * the package working directory.
 */
const stdioArgument = z.string().regex(/^[A-Za-z0-9._+=,:@%~/-]+$/)
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
  permissions: z.array(permissionName).min(1).max(16),
  tools: z.array(z.object({
    name: toolName,
    description: z.string().min(1).max(512),
    inputDescription: z.string().min(1).max(512),
  }).strict()).min(1).max(128),
  entry: relativePath,
}).strict()

/** One declarative Streamable HTTP MCP server entry. */
const mcpHttpServerSchema = z.object({
  id: identifier,
  transport: z.literal('streamable-http'),
  url: z.string().url(),
  headers: z.record(z.string(), z.string()).default({}),
  credentialReferences: z.record(z.string(), reference).default({}),
}).strict()

/** One stdio MCP server entry whose script payload ships inside the package. */
const mcpStdioServerSchema = z.object({
  id: identifier,
  transport: z.literal('stdio'),
  command: bareCommand,
  args: z.array(stdioArgument).min(1).max(64),
  env: z.record(z.string(), z.string()).default({}),
  credentialReferences: z.record(z.string(), reference).default({}),
}).strict()

/** Interception events a hook entry may bind; kept aligned with the bridge surface. */
export const HOOK_EVENTS = ['UserPromptSubmit', 'PreToolUse', 'PostToolUse', 'Stop', 'SessionStart'] as const
/** One interception event a hook entry may bind. */
export type HookEvent = typeof HOOK_EVENTS[number]
const hookEvent = z.enum(HOOK_EVENTS)
const hookMatcher = z.string().max(256)

/** One shell-hook entry bound to one interception event. */
const hookEntrySchema = z.object({
  id: identifier,
  event: hookEvent,
  matcher: hookMatcher.optional(),
  command: bareCommand,
  args: z.array(stdioArgument).min(1).max(64),
  env: z.record(z.string(), z.string()).default({}),
  credentialReferences: z.record(z.string(), reference).default({}),
  timeoutSec: z.number().min(1).max(3600).optional(),
  invocable: z.boolean().optional(),
}).strict()

/** Parsed declarative or stdio MCP package metadata without any credential values. */
export const mcpPackageDescriptorSchema = base.extend({
  kind: z.literal('mcp'),
  permissions: z.array(permissionName).max(16).default([]),
  servers: z.array(z.discriminatedUnion('transport', [mcpHttpServerSchema, mcpStdioServerSchema]))
    .min(1).max(32),
}).strict()

/** Parsed shell-hook package metadata without any credential values. */
export const hookPackageDescriptorSchema = base.extend({
  kind: z.literal('hook'),
  permissions: z.array(permissionName).max(16).default([]),
  hooks: z.array(hookEntrySchema).min(1).max(32),
}).strict()

/** Validated executable Tool package descriptor. */
export type ToolPackageDescriptor = z.infer<typeof toolPackageDescriptorSchema>
/** Validated credential-free MCP descriptor. */
export type McpPackageDescriptor = z.infer<typeof mcpPackageDescriptorSchema>
/** One declared MCP server: Streamable HTTP or stdio. */
export type McpPackageServer = McpPackageDescriptor['servers'][number]
/** Validated credential-free shell-hook descriptor. */
export type HookPackageDescriptor = z.infer<typeof hookPackageDescriptorSchema>
/** One declared shell-hook entry bound to an interception event. */
export type HookPackageEntry = HookPackageDescriptor['hooks'][number]
/** Descriptor accepted by shared signature and file-table operations. */
export type MarketplacePackageDescriptor = ToolPackageDescriptor | McpPackageDescriptor | HookPackageDescriptor

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
 *
 * Cross-field rules: a header or environment slot backed by a credential
 * reference must carry an empty fixed value; every slash-containing stdio
 * argument must be a file in the signed file table; any stdio server implies
 * the `subprocess` permission in the returned disclosure. The implied
 * permission is part of the parsed form both the builder signs and the
 * installer verifies, so signatures stay consistent.
 * @param value - Parsed JSON value.
 * @returns Validated MCP descriptor with effective permissions.
 */
export function parseMcpPackageDescriptor(value: unknown): McpPackageDescriptor {
  const descriptor = mcpPackageDescriptorSchema.parse(value)
  for (const server of descriptor.servers) {
    if (server.transport === 'streamable-http') {
      for (const [header, fixed] of Object.entries(server.headers)) {
        if (server.credentialReferences[header] !== undefined && fixed !== '') {
          throw new Error(`MCP header "${header}" must not contain a credential value`)
        }
      }
      continue
    }
    for (const [name, fixed] of Object.entries(server.env)) {
      if (server.credentialReferences[name] !== undefined && fixed !== '') {
        throw new Error(`MCP environment variable "${name}" must not contain a credential value`)
      }
    }
    for (const arg of server.args) {
      if (arg.includes('/') && descriptor.files[arg] === undefined) {
        throw new Error(`MCP stdio argument "${arg}" is not a declared package file`)
      }
    }
  }
  return withImpliedPermissions(descriptor)
}

/**
 * Add the disclosure every stdio package carries regardless of declaration.
 * @param descriptor - Schema-validated MCP descriptor.
 * @returns Descriptor with `subprocess` present when any server is stdio.
 */
function withImpliedPermissions(descriptor: McpPackageDescriptor): McpPackageDescriptor {
  if (descriptor.permissions.includes('subprocess')) return descriptor
  return descriptor.servers.some(server => server.transport === 'stdio')
    ? { ...descriptor, permissions: [...descriptor.permissions, 'subprocess'] }
    : descriptor
}

/**
 * Parse one credential-free hook descriptor.
 *
 * Cross-field rules: an environment slot backed by a credential reference must
 * carry an empty fixed value; every `SessionStart` entry drops its matcher
 * field (the point has no query subject) and every other entry must declare a
 * non-empty matcher so an always-on hook cannot ship silently; any hook entry
 * implies the `subprocess` permission in the returned disclosure.
 * @param value - Parsed JSON value.
 * @returns Validated hook descriptor with effective permissions.
 */
export function parseHookPackageDescriptor(value: unknown): HookPackageDescriptor {
  const descriptor = hookPackageDescriptorSchema.parse(value)
  for (const hook of descriptor.hooks) {
    for (const [name, fixed] of Object.entries(hook.env)) {
      if (hook.credentialReferences[name] !== undefined && fixed !== '') {
        throw new Error(`Hook environment variable "${name}" must not contain a credential value`)
      }
    }
  }
  type HookEntry = HookPackageDescriptor['hooks'][number]
  const validated: HookEntry[] = descriptor.hooks.map((hook): HookEntry => {
    if (hook.event === 'SessionStart') return hook
    if ((hook.matcher ?? '').trim() === '') throw new Error(`Hook "${hook.id}" must declare a non-empty matcher`)
    return hook
  })
  return withHookImpliedPermissions({ ...descriptor, hooks: validated })
}

/**
 * Add the disclosure every hook package carries regardless of declaration.
 * @param descriptor - Schema-validated hook descriptor.
 * @returns Descriptor with `subprocess` present.
 */
function withHookImpliedPermissions(descriptor: HookPackageDescriptor): HookPackageDescriptor {
  if (descriptor.permissions.includes('subprocess')) return descriptor
  return { ...descriptor, permissions: [...descriptor.permissions, 'subprocess'] }
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
  descriptorFilename: 'tool-package.json' | 'mcp-package.json' | 'hook-package.json',
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
    && entry.name !== 'mcp-package.json'
    && entry.name !== 'hook-package.json')
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
