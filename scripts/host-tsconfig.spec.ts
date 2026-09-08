/** Regression coverage for source declarations owned by the Host aggregate. */

import { fileURLToPath } from 'node:url'
import ts from 'typescript'
import { describe, expect, it } from 'vitest'

describe('Host TypeScript aggregate', () => {
  it('includes the shipped digital employee template required by the Host bundle', () => {
    const configPath = new URL('../tsconfig.host.json', import.meta.url)
    const read = ts.readConfigFile(fileURLToPath(configPath), file => ts.sys.readFile(file))
    if (read.error !== undefined) {
      throw new Error(ts.flattenDiagnosticMessageText(read.error.messageText, '\n'))
    }
    const config = read.config as { references?: Array<{ path?: unknown }> }
    const references = config.references ?? []
    expect(references.map(reference => reference.path)).toContain(
      './packages/examples/digital-employee-template',
    )
  })
})
