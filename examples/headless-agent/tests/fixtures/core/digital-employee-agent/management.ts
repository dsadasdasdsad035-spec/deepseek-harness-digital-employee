import type { Context } from '@qq296629801/cordis'
import type { Plugin } from '@qq296629801/cordis'
import DigitalEmployeeManagement from '@qq296629801/dsh-host-digital-employee-management'

const workspaceRegistryService = {
  get: (id: string) => id === 'digital-employee-management-workspace'
    ? {
      id: 'digital-employee-management-workspace',
      path: process.cwd(),
      attachSession: async () => {},
    }
    : undefined,
}

/** Digital employee management fixture with a minimal workspace registry dependency. */
const managementWithWorkspaceRegistry: Plugin.Object = {
  name: 'digital-employee-management-with-workspace',
  apply: async (ctx: Context) => {
    ctx.provide('workspaceRegistry', workspaceRegistryService)
    await ctx.plugin(DigitalEmployeeManagement as Plugin, {})
  },
}

export default managementWithWorkspaceRegistry
