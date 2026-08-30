import { Zip, ZipDeflate, ZipPassThrough, zipSync } from 'fflate'
import type { Zippable } from 'fflate'

/** One file or directory entry in a hostile-archive fixture. */
export interface ZipFixtureEntry {
  readonly name: string
  readonly data?: Uint8Array
  readonly compressed?: boolean
  readonly attrs?: number
  readonly os?: number
}

/** Build a ZIP without relying on platform archive tools. */
export async function buildZip(entries: readonly ZipFixtureEntry[]): Promise<Buffer> {
  return await new Promise<Buffer>((resolve, reject) => {
    const chunks: Buffer[] = []
    const zip = new Zip((error, data, final) => {
      if (error !== null) reject(error)
      if (data !== undefined) chunks.push(Buffer.from(data))
      if (final) resolve(Buffer.concat(chunks))
    })
    for (const entry of entries) {
      const file = entry.compressed === true
        ? new ZipDeflate(entry.name)
        : new ZipPassThrough(entry.name)
      if (entry.attrs !== undefined) file.attrs = entry.attrs
      if (entry.os !== undefined) file.os = entry.os
      zip.add(file)
      file.push(entry.data ?? new Uint8Array(), true)
    }
    zip.end()
  })
}

/** Build a ZIP whose local headers declare sizes before entry body bytes. */
export function buildDeclaredZip(entries: readonly ZipFixtureEntry[]): Buffer {
  const input: Zippable = {}
  for (const entry of entries) {
    input[entry.name] = [
      entry.data ?? new Uint8Array(),
      {
        ...entry.attrs === undefined ? {} : { attrs: entry.attrs },
        ...entry.os === undefined ? {} : { os: entry.os },
      },
    ]
  }
  return Buffer.from(zipSync(input, { level: 0 }))
}

/** Encode one ZIP request payload. */
export function zipBase64(zip: Uint8Array): string {
  return Buffer.from(zip).toString('base64')
}
