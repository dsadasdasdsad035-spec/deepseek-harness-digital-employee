import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js'
import type { Transport } from '@modelcontextprotocol/sdk/shared/transport.js'
import { afterEach, describe, expect, it } from 'vitest'
import {
  startMarketplaceMcpFixture,
  type MarketplaceMcpFixture,
} from './marketplace-mcp-fixture.ts'

let fixture: MarketplaceMcpFixture | undefined

afterEach(async () => {
  await fixture?.close()
  fixture = undefined
})

describe('marketplace MCP fixture', () => {
  it('binds an ephemeral endpoint, verifies authorization, and serves deterministic lookup', async () => {
    fixture = await startMarketplaceMcpFixture()
    const client = new Client({ name: 'marketplace-fixture-test', version: '1.0.0' })
    await client.connect(new StreamableHTTPClientTransport(new URL(fixture.url), {
      requestInit: { headers: { Authorization: fixture.authorization } },
    }) as Transport)

    await expect(client.callTool({
      name: 'lookup',
      arguments: { query: 'risk-42' },
    })).resolves.toMatchObject({
      content: [{ type: 'text', text: 'MARKETPLACE_TEST_MCP_LOOKUP:risk-42' }],
    })
    expect(fixture.requests()).toContain(fixture.authorization)
    await client.close()
  })
})
