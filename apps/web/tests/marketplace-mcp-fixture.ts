import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http'
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js'
import type { Transport } from '@modelcontextprotocol/sdk/shared/transport.js'
import { z } from 'zod'

/** Running offline MCP marketplace fixture. */
export interface MarketplaceMcpFixture {
  readonly url: string
  readonly authorization: string
  readonly requests: () => readonly string[]
  close(): Promise<void>
}

async function handleRequest(
  request: IncomingMessage,
  response: ServerResponse,
  authorization: string,
  requests: string[],
): Promise<void> {
  const observed = request.headers.authorization
  requests.push(observed ?? '')
  if (observed !== authorization) {
    response.writeHead(401).end('unauthorized')
    return
  }
  const server = new McpServer(
    { name: 'marketplace-test-mcp', version: '1.0.0' },
    { capabilities: { tools: {} } },
  )
  server.registerTool('lookup', {
    description: 'Return a deterministic marketplace MCP lookup marker.',
    inputSchema: { query: z.string().describe('Lookup query.') },
  }, async ({ query }) => ({
    content: [{ type: 'text', text: `MARKETPLACE_TEST_MCP_LOOKUP:${query}` }],
  }))
  const transport = new StreamableHTTPServerTransport({})
  response.on('close', () => {
    void transport.close()
    void server.close()
  })
  await server.connect(transport as Transport)
  await transport.handleRequest(request, response)
}

/** Start the keyless marketplace MCP fixture on an ephemeral loopback port. */
export async function startMarketplaceMcpFixture(): Promise<MarketplaceMcpFixture> {
  const authorization = 'Bearer marketplace-test-token'
  const requests: string[] = []
  const httpServer: Server = createServer((request, response) => {
    handleRequest(request, response, authorization, requests).catch((error: unknown) => {
      response.writeHead(500).end(error instanceof Error ? error.message : String(error))
    })
  })
  const listening: PromiseWithResolvers<void> = Promise.withResolvers()
  httpServer.listen(0, '127.0.0.1', listening.resolve)
  await listening.promise
  const address = httpServer.address()
  if (address === null || typeof address === 'string') {
    await new Promise<void>(resolve => httpServer.close(() => {
      resolve()
    }))
    throw new Error(`expected loopback TCP address, received ${String(address)}`)
  }
  return {
    authorization,
    url: `http://127.0.0.1:${address.port}/mcp`,
    requests: () => [...requests],
    close: async () => {
      await new Promise<void>((resolve, reject) => {
        httpServer.close((error) => {
          if (error === undefined) resolve()
          else reject(error)
        })
      })
    },
  }
}
