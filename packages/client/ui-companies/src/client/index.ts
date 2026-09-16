/** Client registration for the company campus console. */
import type { ClientContext } from '@deepseek-ai/dsh-client-runtime/client'
import type {} from '@deepseek-ai/dsh-api-remotes/client'
import type { InputTriggerServiceContract } from '@deepseek-ai/dsh-client-ui-input-trigger/client'
import type {} from '@deepseek-ai/dsh-client-ui-layout/client'
import type {} from '@deepseek-ai/dsh-client-ui-sidebar/client'
import { createSnapshotStore } from '@deepseek-ai/dsh-client-runtime/client'
import { OrganizationNav } from './CompanyNav.tsx'
import { CompanyWorkspace, type CompanyWorkspaceInjected } from './CompanyWorkspace.tsx'
import { CompanyGroupStore, CompanyStore } from './store.ts'
import { companyIdOfGroupSession, createCompanyGroupMentionSource } from './group-mention.ts'
import { companyGroupMessageDefinition } from './group-definition.ts'
import { companyGroupTurnDefinition } from './group-turn-definition.ts'
import { groupTurnActions } from './group-turn-actions.ts'
import { GroupMessageNodeView } from './GroupMessageNodeView.tsx'
import { GroupTurnNodeView } from './GroupTurnNodeView.tsx'

export { CompanyGroupStore, CompanyStore } from './store.ts'
export type { CompanyGroupRemote, CompanyGroupState, CompanyGroupViewResult, CompanyRemote, CompanySeatVerdict, CompanyState } from './store.ts'
export { OrganizationNav } from './CompanyNav.tsx'
export { companyGroupMessageDefinition } from './group-definition.ts'
export type { CompanyGroupMessageChatData } from './group-definition.ts'
export { companyGroupTurnDefinition } from './group-turn-definition.ts'
export type { CompanyGroupTurnChatData } from './group-turn-definition.ts'
export { GroupMessageNodeView } from './GroupMessageNodeView.tsx'
export { GroupTurnNodeView } from './GroupTurnNodeView.tsx'
export type { OrganizationNavItem, OrganizationNavInjected } from './CompanyNav.tsx'
export { CompanyWorkspace } from './CompanyWorkspace.tsx'
export type { CompanyWorkspaceInjected } from './CompanyWorkspace.tsx'
export {
  COMPANY_GROUP_SESSION_PREFIX, companyIdOfGroupSession, createCompanyGroupMentionSource,
} from './group-mention.ts'
export type { CompanyGroupMentionDependencies } from './group-mention.ts'

/** Required client services and the generated companies namespace. */
export const inject = [
  'slots', 'layout', 'sessions', 'locale', 'remote', 'remote.companies', 'remote.companyGroups',
  'conversationEvents', 'inputTriggers',
]

/** Register one navigation command and one full-screen shell overlay console. */
export function apply(ctx: ClientContext): void {
  ctx.conversationEvents.register(companyGroupMessageDefinition)
  ctx.conversationEvents.register(companyGroupTurnDefinition)
  ctx.slots.inject('conversation.chat.node', () => ctx.slots.register(
    { name: 'conversation.chat.node', key: 'company-group-message' }, GroupMessageNodeView))
  ctx.slots.inject('conversation.chat.node', () => ctx.slots.register(
    { name: 'conversation.chat.node', key: 'company-group-turn' }, GroupTurnNodeView))
  groupTurnActions.cancel = (sessionId) => {
    const companyId = companyIdOfGroupSession(sessionId)
    if (companyId === undefined) return
    void ctx.remote.companyGroups.cancelCompanyGroupTurn(companyId as never)
      .then(() => undefined)
      .catch(() => undefined)
  }
  const controller = new CompanyStore(ctx.remote.companies, ctx.get('sessions')?.list)
  const groupController = new CompanyGroupStore(ctx.remote.companyGroups)
  // Durable whereabouts: scene arrival hooks report through the group gateway.
  controller.visitReporter = (employeeId: string, place: string) => {
    void ctx.remote.companyGroups.reportEmployeeVisit({ employeeId: employeeId as never, place })
      .then(() => undefined)
      .catch(() => undefined)
  }
  const openStore = createSnapshotStore({ open: false })
  const layout = ctx.layout
  const open = (): void => { openStore.set({ open: true }) }
  const close = (): void => { openStore.set({ open: false }) }
  ctx.effect(() => () => {
    controller.dispose()
    groupController.stop()
  }, 'ui-companies: dispose store')

  // The group composer's `@` picker: member candidates scoped to a company
  // group session, inserting a plain `@displayName` the group Lead routes.
  const inputTriggers = ctx.get('inputTriggers') as InputTriggerServiceContract
  const mentionSource = createCompanyGroupMentionSource({
    membersOf: companyId => groupController.membersOf(companyId),
  })
  ctx.effect(() => inputTriggers.registerSource(mentionSource), 'ui-companies: group @ source')

  // The merged 「组织」 dropdown replaces the two standalone footer entries
  // (this package's 「Companies」 and ui-digital-employees' entry, removed in
  // this change): one seat, two surfaces, no cross-package value imports.
  ctx.slots.inject('sidebar.footer.action', () => ctx.slots.register({
    name: 'sidebar.footer.action',
    id: 'organization',
    order: 10,
    label: '组织',
    inject: () => ({
      items: [
        { key: 'companies', icon: '🏠', label: '公司', activate: open },
        {
          key: 'employees',
          icon: '👤',
          label: '数字员工',
          activate: () => { close(); layout.openApplication() },
        },
      ],
    }),
  }, OrganizationNav))

  // shell.application is a single seat owned by the digital employee workspace;
  // a second registrant could only shadow it, so the console rides the additive
  // shell.overlay layer and opts into pointer events for its full-screen shell.
  const injected = (): CompanyWorkspaceInjected => ({
    controller,
    groupStore: groupController,
    hooks: { snapshot: controller.store, open: openStore },
    openSession: (id: string) => {
      // The client session list only refreshes on reconnect; a just-created
      // group session must be pulled into the baseline before selecting it.
      void ctx.sessions.refresh().then(() => { ctx.sessions.open(id as never) }).catch(() => undefined)
    },
    close,
    openEmployeeWorkspace: () => {
      close()
      layout.openApplication()
    },
  })
  ctx.slots.inject('shell.overlay', () => ctx.slots.register({
    name: 'shell.overlay',
    id: 'company-console',
    order: 5,
    inject: injected,
  }, CompanyWorkspace))
}
