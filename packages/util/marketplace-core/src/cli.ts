/** Argument handling and orchestration for the dsh-market-package CLI. */

import { generateKeyPairSync } from 'node:crypto'
import { existsSync } from 'node:fs'
import { readFile, stat, writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { parseArgs } from 'node:util'
import { buildMarketplacePackage } from './package-builder.ts'
import type { MarketplacePackageKind } from './package-builder.ts'
import type { TrustedPublisher } from './descriptors.ts'
import { readTrustedPublisherFileSync } from './trust-file.ts'

const USAGE = [
  'Usage: dsh-market-package <source-directory> --kind tool|mcp|hook --publisher-id <id>',
  '                    (--private-key <path> | --generate-key <path>) [--output <path>]',
  '                    [--trust-file <path>]',
].join('\n')

/** Discriminated CLI outcome; the bin owns presentation and exit codes. */
export type MarketPackageCliOutcome =
  | { readonly ok: true; readonly outputPath: string; readonly trustRecord: TrustedPublisher }
  | { readonly ok: false; readonly message: string }

/**
 * Run one publisher CLI invocation without process mutation.
 * @param args - Arguments after the command name.
 * @returns Built package location and trust record, or a failure message.
 */
export async function runMarketPackageCli(args: readonly string[]): Promise<MarketPackageCliOutcome> {
  let values: ParsedArguments
  try {
    values = parseArguments(args)
  } catch (error) {
    return { ok: false, message: `${(error as Error).message}\n${USAGE}` }
  }
  const privateKeyPem = values.generate
    ? await generatePrivateKey(values.keyPath)
    : await readPrivateKey(values.keyPath)
  if (typeof privateKeyPem !== 'string') return { ok: false, message: privateKeyPem.message }

  try {
    const built = await buildMarketplacePackage({
      sourceDirectory: values.source,
      kind: values.kind,
      publisherId: values.publisherId,
      privateKeyPem,
    })
    if (values.trustFile !== undefined) {
      const failure = await persistTrustRecord(values.trustFile, built.trustRecord)
      if (failure !== null) return { ok: false, message: failure }
    }
    const outputPath = resolve(values.output ?? `${built.descriptor.id}.zip`)
    await writeFile(outputPath, built.archive)
    return { ok: true, outputPath, trustRecord: built.trustRecord }
  } catch (error) {
    return { ok: false, message: (error as Error).message }
  }
}

/** Parsed publisher CLI arguments. */
interface ParsedArguments {
  readonly source: string
  readonly kind: MarketplacePackageKind
  readonly publisherId: string
  readonly keyPath: string
  readonly generate: boolean
  readonly output: string | undefined
  readonly trustFile: string | undefined
}

/**
 * Parse and cross-check the publisher command line.
 * @param args - Arguments after the command name.
 * @returns Validated argument values.
 */
function parseArguments(args: readonly string[]): ParsedArguments {
  const { values, positionals } = parseArgs({
    args,
    options: {
      kind: { type: 'string' },
      'publisher-id': { type: 'string' },
      'private-key': { type: 'string' },
      'generate-key': { type: 'string' },
      output: { type: 'string' },
      'trust-file': { type: 'string' },
    },
    allowPositionals: true,
    strict: true,
  })
  if (positionals.length !== 1) throw new Error('exactly one source directory is required')
  const source = positionals[0] as string
  if (values.kind !== 'tool' && values.kind !== 'mcp' && values.kind !== 'hook') throw new Error('--kind must be tool, mcp, or hook')
  if (typeof values['publisher-id'] !== 'string' || values['publisher-id'] === '') {
    throw new Error('--publisher-id is required')
  }
  const privateKeyPath = values['private-key']
  const generateKeyPath = values['generate-key']
  if (privateKeyPath !== undefined && generateKeyPath !== undefined) {
    throw new Error('pass exactly one of --private-key or --generate-key')
  }
  const keyPath = generateKeyPath ?? privateKeyPath
  if (keyPath === undefined) throw new Error('one of --private-key or --generate-key is required')
  const generate = generateKeyPath !== undefined
  return {
    source,
    kind: values.kind,
    publisherId: values['publisher-id'],
    keyPath,
    generate,
    output: values.output,
    trustFile: values['trust-file'],
  }
}

/**
 * Persist one trust record beside any existing records.
 * @param path - Trusted-publisher file to create or merge into.
 * @param record - Trust record emitted with the built package.
 * @returns null on success, or the failure message.
 */
async function persistTrustRecord(path: string, record: TrustedPublisher): Promise<string | null> {
  try {
    const existing = readTrustedPublisherFileSync(path)
    if (existing === null) {
      await writeFile(path, `${JSON.stringify([record], null, 2)}\n`, { mode: 0o600 })
      return null
    }
    const match = existing.find(entry => entry.id === record.id)
    if (match === undefined) {
      await writeFile(path, `${JSON.stringify([...existing, record], null, 2)}\n`)
      return null
    }
    if (match.publicKeyPem !== record.publicKeyPem) {
      return `refusing to replace the public key for publisher "${record.id}" in "${path}"`
    }
    return null
  } catch (error) {
    return `cannot update trusted-publisher file "${path}": ${(error as Error).message}`
  }
}

/**
 * Read one non-shared Ed25519 private key file.
 * @param path - Private key PEM path.
 * @returns Key PEM, or a failure carrying its message.
 */
async function readPrivateKey(path: string): Promise<string | { message: string }> {
  try {
    const info = await stat(path)
    /* v8 ignore next 2 -- Windows key files do not carry POSIX permission bits */
    if (process.platform !== 'win32' && (info.mode & 0o077) !== 0) {
      return { message: `private key file "${path}" must not be group or world readable` }
    }
    return await readFile(path, 'utf8')
  } catch {
    return { message: `cannot read private key file "${path}"` }
  }
}

/**
 * Create one exclusive Ed25519 private key file.
 * @param path - Destination PEM path.
 * @returns Key PEM, or a failure carrying its message.
 */
async function generatePrivateKey(path: string): Promise<string | { message: string }> {
  try {
    if (existsSync(path)) return { message: `refusing to overwrite existing key file "${path}"` }
    const { privateKey } = generateKeyPairSync('ed25519')
    const pem = privateKey.export({ type: 'pkcs8', format: 'pem' }).toString()
    await writeFile(path, pem, { mode: 0o600 })
    return pem
  } catch {
    return { message: `cannot write private key file "${path}"` }
  }
}
