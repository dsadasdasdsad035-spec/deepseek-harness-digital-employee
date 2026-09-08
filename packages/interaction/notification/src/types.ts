/**
 * Pure types of the notification seam: the message a caller asks to deliver,
 * the closed delivery outcome every channel reports, and the channel
 * interface providers register. Free of host-side value imports so the
 * browser half can reuse it through `./types`.
 *
 * @module @deepseek-ai/dsh-notification/types
 */

/** One alert message a caller asks a channel to deliver. */
export interface NotificationMessage {
  /** Short subject line; non-empty. */
  readonly title: string
  /** Body text; non-empty. */
  readonly body: string
  /** Optional string-valued task/session context a channel may append. */
  readonly context?: Readonly<Record<string, string>>
}

/**
 * The closed outcome of one delivery attempt. `delivered: false` carries a
 * non-empty reason naming what failed; callers record it instead of throwing.
 */
export type NotificationDelivery =
  | { readonly delivered: true }
  | { readonly delivered: false; readonly reason: string }

/** One credential reference a channel resolves, with its configured fact. */
export interface NotificationCredentialState {
  /** The credential reference name (for example an environment variable). */
  readonly ref: string
  /** Whether the credentials service currently resolves this reference. */
  readonly configured: boolean
}

/** One delivery channel a provider registers under a stable id. */
export interface NotificationChannel {
  /** Stable channel id used as the `channel` value of a send request. */
  readonly id: string
  /**
   * Deliver one message. MUST resolve to a closed
   * {@link NotificationDelivery} — never reject — so a failing channel
   * cannot crash the calling task flow.
   * @param message - the message to deliver.
   */
  send(message: NotificationMessage): Promise<NotificationDelivery>
  /**
   * Report the channel's credential references and whether each currently
   * resolves. Configuration surfaces consume this to show setup state
   * WITHOUT any secret value. Omission means the channel declares no
   * credential references.
   * @returns the channel's credential states.
   */
  credentials?(): Promise<readonly NotificationCredentialState[]>
}
