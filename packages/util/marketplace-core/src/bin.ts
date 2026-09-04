#!/usr/bin/env node
/**
 * Build and sign one Tool or MCP marketplace package. stdout carries exactly
 * the trusted-publisher JSON array for `DSH_MARKET_TRUSTED_PUBLISHERS`;
 * diagnostics and the archive path go to stderr.
 * @module @deepseek-ai/dsh-marketplace-core/bin
 */

import { runMarketPackageCli } from './cli.ts'

/* v8 ignore start -- thin self-executing composition over the unit-tested CLI */
const outcome = await runMarketPackageCli(process.argv.slice(2))
if (outcome.ok) {
  process.stdout.write(`${JSON.stringify([outcome.trustRecord])}\n`)
  process.stderr.write(`Package written to ${outcome.outputPath}\n`)
} else {
  process.stderr.write(`${outcome.message}\n`)
  process.exitCode = 1
}
/* v8 ignore stop */
