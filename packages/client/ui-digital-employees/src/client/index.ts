/** Client registration for the digital employee workspace. */
import type { ClientContext, ISessions } from '@deepseek-ai/dsh-client-runtime/client'
import type {} from '@deepseek-ai/dsh-api-remotes/client'
import type {} from '@deepseek-ai/dsh-client-ui-conversation/client'
import type { InputTriggerServiceContract } from '@deepseek-ai/dsh-client-ui-input-trigger/client'
import type {} from '@deepseek-ai/dsh-client-ui-layout/client'
import type {} from '@deepseek-ai/dsh-client-ui-sidebar/client'
import { DigitalEmployeeChatController } from './chat.ts'
import { DigitalEmployeeNav } from './DigitalEmployeeNav.tsx'
import { DigitalEmployeeWorkspace, type DigitalEmployeeWorkspaceInjected } from './DigitalEmployeeWorkspace.tsx'
import { DigitalEmployeeStore } from './store.ts'
import { DigitalEmployeeConfigurationStudioStore } from './configuration-studio.ts'

export { DigitalEmployeeStore } from './store.ts'
export type {
  DigitalEmployeeChatRow, DigitalEmployeeRemote, DigitalEmployeeState, DigitalEmployeeView,
} from './store.ts'
export { DigitalEmployeeChatController } from './chat.ts'
export type { DigitalEmployeeChatDependencies, DigitalEmployeeChatIds } from './chat.ts'
export { DigitalEmployeeNav } from './DigitalEmployeeNav.tsx'
export { DigitalEmployeeWorkspace } from './DigitalEmployeeWorkspace.tsx'
export { DigitalEmployeeConfigurationStudioStore } from './configuration-studio.ts'

/** Required client services and generated namespace. */
export const inject = [
  'slots', 'layout', 'sessions', 'workspaces', 'conversation', 'inputTriggers',
  'remote', 'remote.digitalEmployees',
]

/** Register one navigation command and one root application workspace for this fiber. */
export function apply(ctx: ClientContext): void {
  const controller = new DigitalEmployeeStore(ctx.remote.digitalEmployees)
  const configurationStudio = new DigitalEmployeeConfigurationStudioStore(ctx.remote.digitalEmployees)
  const layout = ctx.layout
  const sessions = ctx.get('sessions') as ISessions | undefined
  if (sessions === undefined) throw new Error('ui-digital-employees: sessions service unavailable')
  const chat = new DigitalEmployeeChatController({
    store: controller,
    remote: ctx.remote.digitalEmployees,
    sessions,
    workspaces: ctx.workspaces,
    conversation: ctx.conversation,
    layout,
  })
  const inputTriggers = ctx.get('inputTriggers') as InputTriggerServiceContract
  ctx.effect(() => inputTriggers.registerSource(chat.source), 'ui-digital-employees: @ source')
  ctx.effect(() => () => {
    chat.dispose()
    controller.dispose()
  }, 'ui-digital-employees: dispose chat and store')
  ctx.slots.inject('sidebar.footer.action', () => ctx.slots.register({
    name: 'sidebar.footer.action',
    id: 'digital-employees',
    order: 10,
    label: 'Digital employees',
    inject: () => ({ open: () => { layout.openApplication() } }),
  }, DigitalEmployeeNav))
  const injected = (): DigitalEmployeeWorkspaceInjected => ({
    controller,
    configurationStudio,
    hooks: { snapshot: controller.store, configurationSnapshot: configurationStudio.store },
    close: () => { layout.closeApplication() },
    startChat: (employeeId) => {
      void chat.openComposer(employeeId).catch((error: unknown) => { controller.reportError(error) })
    },
    previewWorkspace: () => {
      const workspaces = ctx.workspaces.list.getSnapshot()
      const current = sessions.list.getSnapshot().current
      return (current === undefined
        ? undefined
        : workspaces.items.find(workspace => workspace.sessionIds.includes(current))?.workspaceId)
        ?? workspaces.recentWorkspaceId
        ?? workspaces.items.at(0)?.workspaceId
    },
  })
  ctx.slots.inject('shell.application', () => ctx.slots.register({
    name: 'shell.application',
    inject: injected,
  }, DigitalEmployeeWorkspace))
}
