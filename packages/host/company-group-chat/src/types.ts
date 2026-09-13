/** Client-safe company group wire types and the group message session event. */

import type { DigitalEmployeeInstanceId } from '@deepseek-ai/dsh-company'

/** One group member: a digital employee instance currently bound to the company. */
export interface CompanyGroupMember {
  /** Browser-safe employee instance identity. */
  readonly employeeId: DigitalEmployeeInstanceId
  /** Speaker name shown on the employee's messages and mention matching. */
  readonly displayName: string
  /** Department name within the company; the unassigned group when unplaced. */
  readonly departmentName: string
}

/** Who spoke one group message. */
export type CompanyGroupSpeakerKind = 'user' | 'employee'

/** One quoted group message as rendered by clients. */
export interface CompanyGroupMessage {
  /** Session event sequence of the quoted message. */
  readonly seq: number
  readonly speakerKind: CompanyGroupSpeakerKind
  /** Present for employee speakers; omitted for the user. */
  readonly employeeId?: DigitalEmployeeInstanceId
  /** Speaker display name. */
  readonly displayName: string
  /** The spoken text. */
  readonly text: string
  /** Human-readable trigger summary, task broadcasts and mention replies. */
  readonly context?: string
}

/** The group view returned by the gateway remotes. */
export interface CompanyGroupView {
  readonly companyId: string
  readonly companyName: string
  readonly sessionId: string
  readonly members: readonly CompanyGroupMember[]
  readonly messages: readonly CompanyGroupMessage[]
}

/** Payload of one `company-group/message` session event. */
export interface CompanyGroupMessageEvent {
  readonly speakerKind: CompanyGroupSpeakerKind
  /** Present for employee speakers; omitted for the user. */
  readonly employeeId?: DigitalEmployeeInstanceId
  /** Speaker display name at speak time. */
  readonly displayName: string
  /** The spoken text. */
  readonly text: string
  /** Task lifecycle event seq this broadcast reports; the group-log dedup cursor. */
  readonly taskEventSeq?: number
  /** Human-readable trigger summary. */
  readonly context?: string
}

declare module '@deepseek-ai/dsh-session/types' {
  interface SessionEventMap {
    /**
     * One quoted message in a company group conversation.
     *
     * @param speakerKind - whether the user or an employee instance spoke.
     * @param employeeId - the speaking employee instance for employee speakers.
     * @param displayName - speaker display name at speak time.
     * @param text - the spoken text.
     * @param taskEventSeq - task lifecycle event seq this broadcast reports.
     * @param context - human-readable trigger summary.
     */
    'company-group/message': CompanyGroupMessageEvent
  }
}
