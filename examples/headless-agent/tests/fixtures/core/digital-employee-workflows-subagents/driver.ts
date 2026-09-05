#!/usr/bin/env node
import { generateKeyPairSync } from 'node:crypto'
import { fileURLToPath } from 'node:url'
import type { Context } from '@deepseek-ai/cordis'
import { boot, resolveConfigPath } from '@deepseek-ai/dsh-app-boot'
import { signMarketplacePackage } from '@deepseek-ai/dsh-marketplace-core'
import { SessionId, type SessionEvent } from '@deepseek-ai/dsh-session'

const configPath = process.argv[2]
if (configPath === undefined) throw new Error('driver requires config path')
const fixtureDir = fileURLToPath(new URL('.', import.meta.url))
const cwd = process.cwd()

function acceptance(stage: string, data: Record<string, unknown>): void {
  process.stdout.write(JSON.stringify({ type: 'acceptance', stage, ...data }) + '\n')
}
function hookPkg(id: string, entryBase: string) {
  const { privateKey } = generateKeyPairSync('ed25519')
  return signMarketplacePackage({
    kind: 'hook', descriptor: {
      format: 1, kind: 'hook', id, version: '1.0.0',
      display: { name: id, description: 'test.' },
      publisher: { id: 'fixture-publisher', signature: 'pending' },
      files: { [entryBase]: 'GENERATED' }, hooks: [],
    },
    files: { [entryBase]: new TextEncoder().encode('// noop\n') },
    publisherId: 'fixture-publisher',
    privateKeyPem: privateKey.export({ type: 'pkcs8', format: 'pem' }).toString(),
  })
}
function workflowPkg() {
  const { privateKey } = generateKeyPairSync('ed25519')
  return signMarketplacePackage({
    kind: 'workflow', descriptor: {
      format: 1, kind: 'workflow', id: 'noop-workflows', version: '1.0.0',
      display: { name: 'Noop', description: 'No-op workflow.' },
      publisher: { id: 'fixture-publisher', signature: 'pending' },
      files: { 'workflows/noop.js': 'GENERATED' },
      workflows: [{ id: 'noop', entry: 'workflows/noop.js', description: 'No-op.' }],
    },
    files: { 'workflows/noop.js': new TextEncoder().encode('module.exports = {}\n') },
    publisherId: 'fixture-publisher',
    privateKeyPem: privateKey.export({ type: 'pkcs8', format: 'pem' }).toString(),
  })
}
function subagentPkg() {
  const { privateKey } = generateKeyPairSync('ed25519')
  return signMarketplacePackage({
    kind: 'subagent', descriptor: {
      format: 1, kind: 'subagent', id: 'reviewer-subagents', version: '1.0.0',
      display: { name: 'Reviewer', description: 'Test persona.' },
      publisher: { id: 'fixture-publisher', signature: 'pending' },
      files: { 'subagents/reviewer.md': 'GENERATED' },
      subagents: [{ id: 'reviewer', instructions: 'subagents/reviewer.md', tools: [], delegation: { mode: 'one-shot', maxDepth: 1, maxConcurrency: 1, timeoutMs: 30000 } }],
    },
    files: { 'subagents/reviewer.md': new TextEncoder().encode('Review.\n') },
    publisherId: 'fixture-publisher',
    privateKeyPem: privateKey.export({ type: 'pkcs8', format: 'pem' }).toString(),
  })
}

process.env.DSH_WF_SA_FIXTURE_CREDENTIALS = `${cwd}/.credentials.yaml`
process.env.DSH_WF_SA_FIXTURE_HOOKS_ROOT = `${cwd}/hooks-root`
process.env.DSH_WF_SA_FIXTURE_WORKFLOW_ROOT = `${cwd}/workflow-root`
process.env.DSH_WF_SA_FIXTURE_SUBAGENT_ROOT = `${cwd}/subagent-root`
process.env.DSH_DIGITAL_EMPLOYEE_PRESET_ROOT = `${fixtureDir}../digital-employee-agent/presets`
const wf = await workflowPkg()
const sa = await subagentPkg()
process.env.DSH_WF_SA_FIXTURE_TRUSTED_PUBLISHERS = JSON.stringify([wf.trustRecord, sa.trustRecord])

let ctx: Context | undefined
try {
  ctx = await boot('wf-sa-snapshot', resolveConfigPath(configPath, undefined))

  const wfGateway = ctx.workflowMarket
  const wfInstall = await wfGateway.install({ filename: 'wf.zip', archiveBase64: wf.archive.toString('base64'), confirmLocalExecution: true, replaceExisting: true })
  acceptance('workflow-installed', { ok: wfInstall.ok, id: wfInstall.ok ? wfInstall.value.packageId : wfInstall.error?.code })

  const saGateway = ctx.subagentMarket
  const saInstall = await saGateway.install({ filename: 'sa.zip', archiveBase64: sa.archive.toString('base64'), confirmLocalExecution: true, replaceExisting: true })
  acceptance('subagent-installed', { ok: saInstall.ok, id: saInstall.ok ? saInstall.value.packageId : saInstall.error?.code })

  const wfList = await wfGateway.list()
  const saList = await saGateway.list()
  acceptance('inventory', {
    wfEntries: wfList.ok ? wfList.value.entries.map(e => ({ id: e.packageId, entries: e.entries.map(w => w.id) })) : [],
    saEntries: saList.ok ? saList.value.entries.map(e => ({ id: e.packageId, entries: e.entries.map(s => s.id) })) : [],
  })
} finally {
  await ctx?.fiber.dispose()
}
