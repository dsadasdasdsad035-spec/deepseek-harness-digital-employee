const serverModule = process.env.DSH_MCP_SERVER_MODULE
const stdioModule = process.env.DSH_MCP_STDIO_MODULE
const zodModule = process.env.DSH_MCP_ZOD_MODULE
if (serverModule === undefined || stdioModule === undefined || zodModule === undefined) {
  throw new Error('marketplace MCP fixture module URLs are unavailable')
}
const { McpServer } = await import(serverModule)
const { StdioServerTransport } = await import(stdioModule)
const { z } = await import(zodModule)

const server = new McpServer({ name: 'marketplace-test-mcp', version: '1.0.0' })
server.registerTool('lookup', {
  description: 'Return deterministic marketplace fixture data.',
  inputSchema: { query: z.string() },
}, async ({ query }) => ({
  content: [{ type: 'text', text: `MARKETPLACE_TEST_MCP_LOOKUP:${query}` }],
}))

await server.connect(new StdioServerTransport())
