import { createHmac } from 'node:crypto'
import http from 'node:http'
import type { AddressInfo } from 'node:net'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { Context } from '@deepseek-ai/cordis'
import type { CredentialProvider } from '@deepseek-ai/dsh-credentials'
import NotificationService from '@deepseek-ai/dsh-notification'
import * as FeishuBot from '@deepseek-ai/dsh-notification/feishu-bot'
import * as GenericWebhook from '@deepseek-ai/dsh-notification/generic-webhook'
import * as WeChatWorkBot from '@deepseek-ai/dsh-notification/wechat-work-bot'
import { renderText, truncateUtf8 } from '@deepseek-ai/dsh-notification/src/channels.ts'

/** One captured webhook request. */
interface Captured {
  url: string
  body: Record<string, unknown>
}

/** A local HTTP stub that records requests and answers from a script. */
class WebhookStub {
  private readonly server: http.Server
  private script: Array<(req: Captured) => { status: number; text: string }> = []
  readonly requests: Captured[] = []

  constructor() {
    this.server = http.createServer((req, res) => {
      let data = ''
      req.on('data', (chunk: Buffer) => { data += chunk.toString('utf8') })
      req.on('end', () => {
        const captured: Captured = { url: req.url ?? '/', body: JSON.parse(data) as Record<string, unknown> }
        this.requests.push(captured)
        const next = this.script.length > 1 ? this.script.shift() : this.script[0]
        const answer = (next as NonNullable<typeof next>)(captured)
        res.writeHead(answer.status, { 'content-type': 'application/json' })
        res.end(answer.text)
      })
    })
  }

  /** Queue one-shot responses front-first; the last response repeats. */
  respond(...pages: Array<{ status: number; text: string }>): this {
    this.script = pages.map(page => () => page)
    return this
  }

  get url(): string {
    const address = this.server.address() as AddressInfo
    return `http://127.0.0.1:${address.port}/hook`
  }

  listen(): Promise<void> {
    return new Promise((resolve) => { this.server.listen(0, '127.0.0.1', resolve) })
  }

  close(): Promise<void> {
    return new Promise((resolve) => { this.server.close(() => { resolve() }) })
  }
}

/** A minimal credentials provider resolving one mutable table. */
function fakeCredentials(values: Record<string, string>): CredentialProvider & { values: Record<string, string> } {
  return {
    values,
    async resolve(ref: string) {
      const value = values[ref]
      return value === undefined ? undefined : { value, source: 'test' }
    },
  } as unknown as CredentialProvider & { values: Record<string, string> }
}

const MESSAGE = { title: 'task suspended', body: 'three consecutive failures', context: { employee: 'pm' } }

describe('NotificationService registry', () => {
  it('reports unknown channels without throwing', async () => {
    const ctx = new Context()
    await ctx.plugin(NotificationService)
    const outcome = await ctx.notifications.send({ channel: 'nope', title: 't', body: 'b' })
    expect(outcome).toEqual({ delivered: false, reason: 'unknown channel "nope" (registered: )' })
  })

  it('rejects duplicate channel ids', async () => {
    const ctx = new Context()
    await ctx.plugin(NotificationService)
    const channel = { id: 'dup', send: async () => ({ delivered: true } as const) }
    ctx.notifications.register(channel)
    expect(() => ctx.notifications.register(channel)).toThrow(/already registered/)
  })

  it('contains a throwing channel into a delivered:false outcome', async () => {
    const ctx = new Context()
    await ctx.plugin(NotificationService)
    ctx.notifications.register({
      id: 'broken',
      send: async () => { throw new Error('boom') },
    })
    const outcome = await ctx.notifications.send({ channel: 'broken', title: 't', body: 'b' })
    expect(outcome.delivered).toBe(false)
    if (!outcome.delivered) expect(outcome.reason).toContain('channel "broken" threw: boom')
  })
})

describe('generic-webhook channel', () => {
  let stub: WebhookStub
  let ctx: Context

  beforeEach(async () => {
    stub = new WebhookStub()
    await stub.listen()
    ctx = new Context()
    await ctx.plugin(NotificationService)
  })

  afterEach(async () => {
    await stub.close()
  })

  it('delivers the message document and reports success', async () => {
    stub.respond({ status: 200, text: '{"ok":true}' })
    ctx.provide('credentials', fakeCredentials({ HOOK_URL: stub.url }))
    await ctx.plugin(GenericWebhook, { urlRef: 'HOOK_URL', retries: 0 })
    const outcome = await ctx.notifications.send({ channel: 'generic-webhook', ...MESSAGE })
    expect(outcome).toEqual({ delivered: true })
    const body = stub.requests[0]?.body as Record<string, unknown>
    expect(body.title).toBe(MESSAGE.title)
    expect(body.body).toBe(MESSAGE.body)
    expect(body.context).toEqual(MESSAGE.context)
    expect(typeof body.timestamp).toBe('string')
  })

  it('retries a failed attempt and succeeds on the second', async () => {
    stub.respond({ status: 500, text: '' }, { status: 200, text: '' })
    ctx.provide('credentials', fakeCredentials({ HOOK_URL: stub.url }))
    await ctx.plugin(GenericWebhook, { urlRef: 'HOOK_URL', retries: 1, timeoutMs: 2_000 })
    const outcome = await ctx.notifications.send({ channel: 'generic-webhook', title: 't', body: 'b' })
    expect(outcome).toEqual({ delivered: true })
    expect(stub.requests).toHaveLength(2)
  })

  it('reports exhaustion with the last HTTP failure', async () => {
    stub.respond({ status: 500, text: '' })
    ctx.provide('credentials', fakeCredentials({ HOOK_URL: stub.url }))
    await ctx.plugin(GenericWebhook, { urlRef: 'HOOK_URL', retries: 1, timeoutMs: 2_000 })
    const outcome = await ctx.notifications.send({ channel: 'generic-webhook', title: 't', body: 'b' })
    expect(outcome.delivered).toBe(false)
    if (!outcome.delivered) expect(outcome.reason).toContain('after 2 attempt(s): HTTP 500')
  })

  it('treats a non-JSON 2xx body as success', async () => {
    stub.respond({ status: 204, text: '' })
    ctx.provide('credentials', fakeCredentials({ HOOK_URL: stub.url }))
    await ctx.plugin(GenericWebhook, { urlRef: 'HOOK_URL', retries: 0 })
    const outcome = await ctx.notifications.send({ channel: 'generic-webhook', title: 't', body: 'b' })
    expect(outcome).toEqual({ delivered: true })
  })

  it('fails visibly when no credentials service is composed', async () => {
    await ctx.plugin(GenericWebhook, { urlRef: 'HOOK_URL', retries: 0 })
    const outcome = await ctx.notifications.send({ channel: 'generic-webhook', title: 't', body: 'b' })
    expect(outcome.delivered).toBe(false)
    if (!outcome.delivered) expect(outcome.reason).toContain('is not configured: credential "HOOK_URL" is unresolved')
  })

  it('fails visibly when the URL credential resolves to nothing', async () => {
    ctx.provide('credentials', fakeCredentials({}))
    await ctx.plugin(GenericWebhook, { urlRef: 'HOOK_URL', retries: 0 })
    const outcome = await ctx.notifications.send({ channel: 'generic-webhook', title: 't', body: 'b' })
    expect(outcome.delivered).toBe(false)
    if (!outcome.delivered) expect(outcome.reason).toContain('credential "HOOK_URL" is unresolved')
  })

  it('reports a network failure without throwing', async () => {
    ctx.provide('credentials', fakeCredentials({ HOOK_URL: 'http://127.0.0.1:1/hook' }))
    await ctx.plugin(GenericWebhook, { urlRef: 'HOOK_URL', retries: 0, timeoutMs: 500 })
    const outcome = await ctx.notifications.send({ channel: 'generic-webhook', title: 't', body: 'b' })
    expect(outcome.delivered).toBe(false)
    if (!outcome.delivered) expect(outcome.reason).toContain('network:')
  })
})

describe('wechat-work-bot channel', () => {
  let stub: WebhookStub
  let ctx: Context

  beforeEach(async () => {
    stub = new WebhookStub()
    await stub.listen()
    ctx = new Context()
    await ctx.plugin(NotificationService)
    ctx.provide('credentials', fakeCredentials({ WECOM_URL: stub.url }))
  })

  afterEach(async () => {
    await stub.close()
  })

  it('posts a msgtype text document and succeeds on errcode 0', async () => {
    stub.respond({ status: 200, text: '{"errcode":0,"errmsg":"ok"}' })
    await ctx.plugin(WeChatWorkBot, { urlRef: 'WECOM_URL', retries: 0 })
    const outcome = await ctx.notifications.send({ channel: 'wechat-work-bot', ...MESSAGE })
    expect(outcome).toEqual({ delivered: true })
    const body = stub.requests[0]?.body as Record<string, unknown>
    expect(body.msgtype).toBe('text')
    expect((body.text as { content: string }).content).toBe(renderText(MESSAGE))
  })

  it('fails on a nonzero errcode', async () => {
    stub.respond({ status: 200, text: '{"errcode":40001,"errmsg":"invalid token"}' })
    await ctx.plugin(WeChatWorkBot, { urlRef: 'WECOM_URL', retries: 0 })
    const outcome = await ctx.notifications.send({ channel: 'wechat-work-bot', title: 't', body: 'b' })
    expect(outcome.delivered).toBe(false)
    if (!outcome.delivered) expect(outcome.reason).toContain('errcode 40001: invalid token')
  })

  it('fails when the answer carries no errcode', async () => {
    stub.respond({ status: 200, text: '{}' })
    await ctx.plugin(WeChatWorkBot, { urlRef: 'WECOM_URL', retries: 0 })
    const outcome = await ctx.notifications.send({ channel: 'wechat-work-bot', title: 't', body: 'b' })
    expect(outcome.delivered).toBe(false)
    if (!outcome.delivered) expect(outcome.reason).toContain('without an errcode field')
  })
})

describe('feishu-bot channel', () => {
  let stub: WebhookStub
  let ctx: Context

  beforeEach(async () => {
    stub = new WebhookStub()
    await stub.listen()
    ctx = new Context()
    await ctx.plugin(NotificationService)
    ctx.provide('credentials', fakeCredentials({ FEISHU_URL: stub.url, FEISHU_SECRET: 's3cret' }))
  })

  afterEach(async () => {
    await stub.close()
  })

  it('posts an unsigned text document without a secretRef', async () => {
    stub.respond({ status: 200, text: '{"code":0,"msg":"success"}' })
    await ctx.plugin(FeishuBot, { urlRef: 'FEISHU_URL', retries: 0 })
    const outcome = await ctx.notifications.send({ channel: 'feishu-bot', ...MESSAGE })
    expect(outcome).toEqual({ delivered: true })
    const body = stub.requests[0]?.body as Record<string, unknown>
    expect(body.msg_type).toBe('text')
    expect(body.sign).toBeUndefined()
    expect((body.content as { text: string }).text).toBe(renderText(MESSAGE))
  })

  it('signs the body with the Feishu dialect when a secretRef resolves', async () => {
    stub.respond({ status: 200, text: '{"code":0,"msg":"success"}' })
    await ctx.plugin(FeishuBot, { urlRef: 'FEISHU_URL', secretRef: 'FEISHU_SECRET', retries: 0 })
    const outcome = await ctx.notifications.send({ channel: 'feishu-bot', ...MESSAGE })
    expect(outcome).toEqual({ delivered: true })
    const body = stub.requests[0]?.body as Record<string, unknown>
    const timestamp = body.timestamp as string
    const expected = createHmac('sha256', `${timestamp}\ns3cret`).update('').digest('base64')
    expect(body.sign).toBe(expected)
  })

  it('fails on a nonzero code such as a signature mismatch', async () => {
    stub.respond({ status: 200, text: '{"code":19021,"msg":"sign match fail"}' })
    await ctx.plugin(FeishuBot, { urlRef: 'FEISHU_URL', retries: 0 })
    const outcome = await ctx.notifications.send({ channel: 'feishu-bot', title: 't', body: 'b' })
    expect(outcome.delivered).toBe(false)
    if (!outcome.delivered) expect(outcome.reason).toContain('code 19021: sign match fail')
  })

  it('accepts the legacy StatusCode dialect', async () => {
    stub.respond({ status: 200, text: '{"StatusCode":0,"StatusMessage":"success"}' })
    await ctx.plugin(FeishuBot, { urlRef: 'FEISHU_URL', retries: 0 })
    const outcome = await ctx.notifications.send({ channel: 'feishu-bot', title: 't', body: 'b' })
    expect(outcome).toEqual({ delivered: true })
  })

  it('fails when the secret credential is configured but unresolved', async () => {
    await ctx.plugin(FeishuBot, { urlRef: 'FEISHU_URL', secretRef: 'MISSING', retries: 0 })
    const outcome = await ctx.notifications.send({ channel: 'feishu-bot', title: 't', body: 'b' })
    expect(outcome.delivered).toBe(false)
    if (!outcome.delivered) expect(outcome.reason).toContain('credential "MISSING" is unresolved')
  })
})

describe('text rendering helpers', () => {
  it('renders title, body, and context lines', () => {
    expect(renderText(MESSAGE)).toBe('task suspended\n\nthree consecutive failures\n\nemployee: pm')
    expect(renderText({ title: 't', body: 'b' })).toBe('t\n\nb')
  })

  it('clips on a UTF-8 character boundary and marks the cut', () => {
    const clipped = truncateUtf8('你好'.repeat(2000), 100)
    expect(Buffer.byteLength(clipped, 'utf8')).toBeLessThanOrEqual(100)
    expect(Buffer.byteLength(clipped, 'utf8')).toBeGreaterThan(90)
    expect(clipped.endsWith('...')).toBe(true)
    expect(truncateUtf8('short', 100)).toBe('short')
  })
})
