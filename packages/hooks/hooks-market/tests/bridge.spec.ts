import { generateKeyPairSync } from 'node:crypto'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { Context } from '@deepseek-ai/cordis'
import { signMarketplacePackage } from '@deepseek-ai/dsh-marketplace-core'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { HookMarketGateway, mountEmployeeHooks } from '../src/index.ts'

const roots: string[] = []

afterEach(async () => {
  await Promise.all(roots.splice(0).map(root => rm(root, { recursive: true, force: true })))
})

async function signedHookArchive(): Promise<string> {
  const { privateKey } = generateKeyPairSync('ed25519')
  const script = [
    "let input = ''",
    'process.stdin.setEncoding(\'utf8\')',
    "process.stdin.on('data', (chunk) => { input += chunk })",
    "process.stdin.on('end', () => {",
    "  process.stdout.write('HOOK-SAW:' + input.length)",
    '})',
  ].join('\n')
  const built = await signMarketplacePackage({
    kind: 'hook',
    descriptor: {
      format: 1,
      kind: 'hook',
      id: 'echo-hooks',
      version: '1.0.0',
      display: { name: 'Echo hooks', description: 'test hook package.' },
      publisher: { id: 'deepseek-local', signature: 'pending' },
      files: { 'hooks/echo.js': 'pending' },
      hooks: [{
        id: 'echo',
        event: 'UserPromptSubmit',
        matcher: 'test-hook',
        command: 'node',
        args: ['hooks/echo.js'],
        invocable: true,
      }],
    },
    files: { 'hooks/echo.js': new TextEncoder().encode(script) },
    publisherId: 'deepseek-local',
    privateKeyPem: privateKey.export({ type: 'pkcs8', format: 'pem' }).toString(),
  })
  return built.archive.toString('base64')
}

describe('hooks-market bridge', () => {
  it('installs a hook package and runs an invocable hook through the mounted tool', async () => {
    const installRoot = await mkdtemp(join(tmpdir(), 'dsh-hooks-market-'))
    roots.push(installRoot)
    const resolve = vi.fn(async () => ({ value: 'resolved-secret', source: 'memory' }))
    const describe = vi.fn(async () => ({ configured: true, source: 'memory', writable: true }))
    const shell = { run: vi.fn(async (_command: string, _options: unknown) => ({
      exitCode: 0, stdout: '', stderr: '',
    })) }
    const ctx = new Context()
    ctx.provide('credentials', { resolve, describe } as never)
    ctx.provide('shell', shell as never)
    await ctx.plugin(HookMarketGateway, {
      installRoot,
      trustedPublishers: [],
      allowUnsignedPackages: true,
    })
    const gateway = ctx.get('hookMarket') as HookMarketGateway
    await expect(gateway.install({
      filename: 'echo-hooks.zip',
      archiveBase64: await signedHookArchive(),
      confirmLocalExecution: true,
    })).resolves.toMatchObject({ ok: true, value: { operation: 'installed' } })

    const installed = await gateway.installedPackages()
    expect(installed).toHaveLength(1)
    expect(installed[0]?.descriptor.hooks[0]).toMatchObject({ id: 'echo', invocable: true })

    const list = await gateway.list()
    expect(JSON.stringify(list)).not.toContain('resolved-secret')
    await ctx.fiber.dispose()
  })

  it('mountEmployeeHooks registers an invocable tool that executes the hook command', async () => {
    const installRoot = await mkdtemp(join(tmpdir(), 'dsh-hooks-bridge-'))
    roots.push(installRoot)
    const registered = new Map<string, (args: unknown, exec: { signal: AbortSignal }) => Promise<string>>()
    const agentCtx = new Context()
    agentCtx.provide('shell', {
      run: vi.fn(async () => ({ exitCode: 0, stdout: '', stderr: '' })),
    } as never)
    agentCtx.provide('tools', {
      register: vi.fn((definition: { name: string; execute: (args: unknown, exec: { signal: AbortSignal }) => Promise<string> }) => {
        registered.set(definition.name, definition.execute)
        return () => { registered.delete(definition.name) }
      }),
    } as never)
    const gateway = { resolveSlotValue: vi.fn(async () => 'resolved-secret') }
    ;(agentCtx.root as unknown as { hookMarket: unknown }).hookMarket = gateway

    mountEmployeeHooks(agentCtx, [{
      pkg: {
        packageId: 'echo-hooks',
        directory: installRoot,
        descriptor: {
          format: 1, kind: 'hook', id: 'echo-hooks', version: '1.0.0',
          display: { name: 'Echo', description: '' },
          publisher: { id: 'deepseek-local', signature: 'sig' },
          files: {}, permissions: ['subprocess'],
          hooks: [{
            id: 'echo', event: 'UserPromptSubmit', matcher: 'test-hook',
            command: 'node', args: ['hooks/echo.js'], env: {}, credentialReferences: {}, invocable: true,
          }],
        },
        references: {},
      },
      hook: {
        id: 'echo', event: 'UserPromptSubmit', matcher: 'test-hook',
        command: 'node', args: ['hooks/echo.js'], env: {}, credentialReferences: {}, invocable: true,
      },
    }], { workdir: installRoot })

    expect(registered.has('hook__echo')).toBe(true)
    const result = await registered.get('hook__echo')!({ input: 'hello' }, { signal: new AbortController().signal })
    expect(result).toBe('')
  })
})
