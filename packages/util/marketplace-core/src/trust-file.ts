/** Persistent trusted-publisher file loading shared by marketplace gateways. */

import { lstatSync, readFileSync } from 'node:fs'
import type { Stats } from 'node:fs'
import type { TrustedPublisher } from './descriptors.ts'

/** Conventional trusted-publisher filename inside the Harness home. */
export const TRUSTED_PUBLISHERS_FILENAME = 'market-publishers.json'

/**
 * Read and validate one trusted-publisher file synchronously at composition.
 * @param path - Absolute or config-relative file path.
 * @returns Validated records, or null when the file is absent.
 * @throws when the file is unsafe, malformed, or contains duplicate ids.
 */
export function readTrustedPublisherFileSync(path: string): readonly TrustedPublisher[] | null {
  let info: Stats
  try {
    info = lstatSync(path)
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return null
    throw error
  }
  if (info.isSymbolicLink()) throw new Error(`trusted-publisher file "${path}" is a symbolic link`)
  if (!info.isFile()) throw new Error(`trusted-publisher file "${path}" is not a regular file`)
  /* v8 ignore next 2 -- Windows files do not carry POSIX permission bits */
  if (process.platform !== 'win32' && (info.mode & 0o022) !== 0) {
    throw new Error(`trusted-publisher file "${path}" must not be group or world writable`)
  }
  let parsed: unknown
  try {
    parsed = JSON.parse(readFileSync(path, 'utf8'))
  } catch {
    throw new Error(`trusted-publisher file "${path}" must contain a JSON array`)
  }
  if (!Array.isArray(parsed)) throw new Error(`trusted-publisher file "${path}" must contain a JSON array`)
  const records: TrustedPublisher[] = []
  const seen = new Set<string>()
  parsed.forEach((value, index) => {
    if (typeof value !== 'object' || value === null) {
      throw new Error(`trusted-publisher file "${path}" record ${index} is not an object`)
    }
    const { id, publicKeyPem } = value as { id?: unknown; publicKeyPem?: unknown }
    if (typeof id !== 'string' || id === '') {
      throw new Error(`trusted-publisher file "${path}" record ${index} has no publisher id`)
    }
    if (typeof publicKeyPem !== 'string' || publicKeyPem === '') {
      throw new Error(`trusted-publisher file "${path}" record "${id}" has no public key`)
    }
    if (seen.has(id)) {
      throw new Error(`trusted publisher "${id}" appears more than once in "${path}"`)
    }
    seen.add(id)
    records.push({ id, publicKeyPem })
  })
  return records
}

/**
 * Combine inline and file-sourced records, rejecting every duplicate id.
 * @param inline - Records supplied by plugin configuration or the launch environment.
 * @param fromFile - Records read from the trusted-publisher file.
 * @param path - Trusted-publisher file path for failure context.
 * @returns The combined unique-id trust list.
 * @throws when any publisher id appears in either source more than once.
 */
export function combineTrustedPublisherRecords(
  inline: readonly TrustedPublisher[],
  fromFile: readonly TrustedPublisher[],
  path: string,
): readonly TrustedPublisher[] {
  const combined = [...inline, ...fromFile]
  const seen = new Set<string>()
  for (const record of combined) {
    if (seen.has(record.id)) {
      throw new Error(
        `trusted publisher "${record.id}" is configured more than once across plugin configuration and "${path}"`,
      )
    }
    seen.add(record.id)
  }
  return combined
}
