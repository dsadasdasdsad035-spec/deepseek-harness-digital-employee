import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js'
import { z } from 'zod'

const server = new McpServer({
  name: 'mcp-market-template-local',
  version: '1.0.0',
})

server.registerTool(
  'marketplace_local_echo',
  {
    description: 'Return the supplied text from the signed marketplace stdio template.',
    inputSchema: { text: z.string().describe('Text to return.') },
  },
  async ({ text }) => ({ content: [{ type: 'text', text }] }),
)

await server.connect(new StdioServerTransport())
