import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js'

const project = {
  project: 'Atlas',
  milestones: [
    { name: 'Discovery', owner: 'Mina', status: 'complete' },
    { name: 'Pilot', owner: 'Chen', status: 'at-risk' },
  ],
  risks: [{ id: 'R-1', owner: 'Chen', summary: 'Pilot acceptance criteria are pending.' }],
}

const server = new McpServer({ name: 'project-manager-test-data', version: '1.0.0' })
server.registerTool('project_snapshot', {
  description: 'Read deterministic Atlas milestones, owners, and risks.',
  inputSchema: {},
}, async () => ({
  content: [{ type: 'text', text: JSON.stringify(project) }],
  structuredContent: project,
}))

await server.connect(new StdioServerTransport())
