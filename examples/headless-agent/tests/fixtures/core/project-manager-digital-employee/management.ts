import type { Context, Plugin } from '@deepseek-ai/cordis'
import DigitalEmployeeManagement from '@deepseek-ai/dsh-host-digital-employee-management'

const workspaceRegistryService = {
  get: (id: string) => id === 'project-manager-management-workspace'
    ? {
      id,
      path: process.cwd(),
      attachSession: async () => {},
    }
    : undefined,
}

/** Management gateway fixture with the workspace registry it requires. */
const managementWithWorkspaceRegistry = {
  name: 'project-manager-management-with-workspace',
  apply: async (ctx: Context) => {
    ctx.provide('workspaceRegistry', workspaceRegistryService)
    await ctx.plugin(DigitalEmployeeManagement as Plugin, {})
  },
}

export default managementWithWorkspaceRegistry as Plugin
