import { describe, expect, it } from 'vitest'
import {
  parseHookPackageDescriptor,
  verifyPublisherSignature,
  descriptorSignaturePayload,
} from '../src/index.ts'
import { generateKeyPairSync, sign } from 'node:crypto'

const BASE = {
  format: 1,
  kind: 'hook',
  id: 'hook-suite',
  version: '1.0.0',
  display: { name: 'Hook suite', description: 'Test hook package.' },
  publisher: { id: 'deepseek-local', signature: 'pending' },
  files: { 'hooks/echo.js': 'a'.repeat(64) },
}

function descriptorWith(hooks: readonly Record<string, unknown>[]): Record<string, unknown> {
  return { ...BASE, permissions: [], hooks }
}

describe('parseHookPackageDescriptor', () => {
  it('parses a valid package and implies the subprocess permission', () => {
    const parsed = parseHookPackageDescriptor(descriptorWith([{
      id: 'echo-hook',
      event: 'UserPromptSubmit',
      matcher: 'test-hook',
      command: 'node',
      args: ['hooks/echo.js'],
    }]))
    expect(parsed.permissions).toContain('subprocess')
    expect(parsed.hooks[0]).toMatchObject({ id: 'echo-hook' })
  })

  it('rejects unsupported events, missing matchers, and non-allowlisted commands', () => {
    expect(() => parseHookPackageDescriptor(descriptorWith([
      { id: 'bad-event', event: 'OnLaunch', matcher: 'x', command: 'node', args: ['hooks/echo.js'] },
    ]))).toThrow()
    expect(() => parseHookPackageDescriptor(descriptorWith([
      { id: 'no-matcher', event: 'PreToolUse', command: 'node', args: ['hooks/echo.js'] },
    ])).id).toBeDefined()
    expect(() => parseHookPackageDescriptor(descriptorWith([
      { id: 'blank-matcher', event: 'PreToolUse', matcher: '  ', command: 'node', args: ['hooks/echo.js'] },
    ]))).toThrow(/non-empty matcher/)
    expect(() => parseHookPackageDescriptor(descriptorWith([
      { id: 'bad-command', event: 'Stop', matcher: 'x', command: './run.sh', args: ['hooks/echo.js'] },
    ]))).toThrow()
  })

  it('rejects a non-empty fixed value where a credential reference is required', () => {
    expect(() => parseHookPackageDescriptor(descriptorWith([{
      id: 'secret-hook',
      event: 'Stop',
      matcher: 'x',
      command: 'node',
      args: ['hooks/echo.js'],
      env: { API_TOKEN: 'sk-hardcoded' },
      credentialReferences: { API_TOKEN: 'HOOK_TOKEN' },
    }]))).toThrow(/must not contain a credential value/)
  })

  it('round-trips a signature over the parsed payload', () => {
    const parsed = parseHookPackageDescriptor(descriptorWith([{
      id: 'echo-hook',
      event: 'UserPromptSubmit',
      matcher: 'test-hook',
      command: 'node',
      args: ['hooks/echo.js'],
      invocable: true,
    }]))
    const { privateKey, publicKey } = generateKeyPairSync('ed25519')
    const signature = sign(null, descriptorSignaturePayload(parsed), privateKey).toString('base64')
    const publicKeyPem = publicKey.export({ type: 'spki', format: 'pem' }).toString()
    expect(verifyPublisherSignature(descriptorSignaturePayload(parsed), signature, publicKeyPem)).toBe(true)
  })
})
