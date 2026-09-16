/** Group-session `@` source: employee mention candidates for one company's group composer. */
import type {
  CandidateRequest, ClientSessionContext, InputTriggerSource, InputTriggerCandidate,
} from '@deepseek-ai/dsh-client-ui-input-trigger/client'
import type { CompanyGroupMemberView } from './store.ts'

/**
 * Deterministic prefix of a company group session id. Must match the host's
 * `groupSessionId` derivation; member sessions use the distinct
 * `session-group-member-` prefix, so the two never collide.
 */
export const COMPANY_GROUP_SESSION_PREFIX = 'session-company-group-'

/** Services the group mention source reads. */
export interface CompanyGroupMentionDependencies {
  /**
   * Read one company's current bound group members.
   * @param companyId - the company whose roster is read.
   * @returns the bound members; an empty roster when unavailable.
   */
  membersOf(companyId: string): Promise<readonly CompanyGroupMemberView[]>
}

/**
 * Resolve the owning company of a company group session.
 * @param sessionId - the client session identity.
 * @returns the company id, or undefined when the session is not a group session.
 */
export function companyIdOfGroupSession(sessionId: string): string | undefined {
  if (!sessionId.startsWith(COMPANY_GROUP_SESSION_PREFIX)) return undefined
  const companyId = sessionId.slice(COMPANY_GROUP_SESSION_PREFIX.length)
  return companyId === '' ? undefined : companyId
}

/**
 * Build the `@` source that lists one company group's bound employees and
 * inserts a plain `@displayName` mention. The inserted text is deliberately not
 * a routing reference: the group Lead's `@`-mention router resolves plain text,
 * so the pick only needs to spell the name.
 * @param deps - roster reader for the owning company.
 * @returns the group-session-scoped mention source.
 */
export function createCompanyGroupMentionSource(
  deps: CompanyGroupMentionDependencies,
): InputTriggerSource {
  return {
    trigger: '@',
    name: 'company-group-member',
    // Above the file/session reference group so members lead in a group composer.
    order: -20,
    showGroupTitle: true,
    async candidates(
      session: ClientSessionContext,
      { query, signal }: CandidateRequest,
    ): Promise<readonly InputTriggerCandidate[]> {
      const companyId = companyIdOfGroupSession(session.sessionId)
      if (companyId === undefined) return []
      const members = await deps.membersOf(companyId)
      if (signal.aborted) return []
      const needle = query.trim().toLocaleLowerCase()
      return members
        .filter(member => needle === ''
          || member.displayName.toLocaleLowerCase().includes(needle))
        .map(member => ({
          name: member.displayName,
          description: member.departmentName,
          value: member.employeeId,
        }))
    },
    onPick: ({ candidate }) => candidate.name === ''
      ? undefined
      : { text: `@${candidate.name} ` },
  }
}
