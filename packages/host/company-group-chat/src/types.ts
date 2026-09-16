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


/** One durable amenity arrival. */
export interface EmployeeVisitEntry {
  readonly place: string
  readonly at: number
}

/** One employee's durable presence view. */
export interface EmployeePresenceView {
  readonly employeeId: string
  readonly lastSeenAt: number
  readonly lastPlace: string
  readonly visits: readonly EmployeeVisitEntry[]
}

/** Request reporting one amenity arrival. */
export interface ReportEmployeeVisitRequest {
  readonly employeeId: DigitalEmployeeInstanceId
  readonly place: string
}

/** Request reading one employee's presence history. */
export interface EmployeePresenceRequest {
  readonly employeeId: DigitalEmployeeInstanceId
}

/** Payload of the `company-group/opened` creation marker. */
export interface CompanyGroupOpenedEvent {
  /** The company whose group this session hosts. */
  readonly companyId: string
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

/** Payload of one `company-group/turn-queued` session event. */
export interface CompanyGroupTurnQueuedEvent {
  /** The employee whose continuable member session receives the delivery. */
  readonly employeeId: DigitalEmployeeInstanceId
  /** Browser-safe member session identity for live generation projection. */
  readonly memberSessionId: string
  /** Speaker display name at queue time, for the group view's typing indicator. */
  readonly displayName: string
  /** The delivery situation handed to the member turn; never a script. */
  readonly situation: string
  /** Human-readable trigger summary; also the deterministic fallback line basis. */
  readonly context: string
  /** Task lifecycle dedup cursor (`task:<seq>`); mention deliveries carry none. */
  readonly dedupKey?: string
}

/** Payload of one `company-group/turn-delivered` session event. */
export interface CompanyGroupTurnDeliveredEvent {
  /** Seq of the `company-group/turn-queued` event this delivery settled. */
  readonly queueSeq: number
}

declare module '@deepseek-ai/dsh-session/types' {
  interface SessionEventMap {
    /**
     * Creation marker: this session hosts one company's group.
     *
     * @param companyId - the company whose group this session hosts.
     */
    'company-group/opened': CompanyGroupOpenedEvent
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
    /**
     * One queued delivery into an employee's continuable member session.
     *
     * @param employeeId - the employee whose member session receives the delivery.
     * @param memberSessionId - browser-safe member session identity.
     * @param displayName - speaker display name at queue time.
     * @param situation - the delivery situation handed to the member turn.
     * @param context - human-readable trigger summary.
     * @param dedupKey - task lifecycle dedup cursor.
     */
    'company-group/turn-queued': CompanyGroupTurnQueuedEvent
    /**
     * One settled delivery: the queued member turn spoke, degraded to its
     * deterministic fallback, or was dropped (member no longer bound).
     *
     * @param queueSeq - seq of the settled `company-group/turn-queued` event.
     */
    'company-group/turn-delivered': CompanyGroupTurnDeliveredEvent
  }
}
